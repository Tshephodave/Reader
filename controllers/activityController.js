const Activity = require('../models/Activity');
const ActivityResponse = require('../models/ActivityResponse');
const Media = require('../models/Media');
const { assertCanOpenBook } = require('../utils/access');
const { HttpError, assertObjectId } = require('../utils/http');

const norm = (value) => String(value).toLowerCase().trim();

const isAnswerCorrect = (question, userAnswer) => {
  switch (question.type) {
    case 'multiple-choice':
    case 'true-false':
    case 'fill-blank':
      return Boolean(question.correctAnswer) && norm(userAnswer) === norm(question.correctAnswer);
    case 'open-ended':
      // Open-ended questions are marked as complete once answered.
      return true;
    default:
      return false;
  }
};

// Students must never receive the answer key up front.
const hideAnswer = (question) => {
  // The "answer audio" often says the answer out loud, so it is only sent after answering.
  const { correctAnswer, answerAudioId, ...rest } = question;
  return rest;
};

const sortedQuestions = (questions) => [...questions].sort((a, b) => a.order - b.order);

const summarizeProgress = (activity, response) => {
  const total = activity.questions.length;
  const answers = response ? response.responses : [];
  const byQuestion = new Map(activity.questions.map((q) => [String(q._id), q]));

  return {
    answered: answers.length,
    total,
    totalPointsEarned: response ? response.totalPointsEarned : 0,
    isCompleted: Boolean(response && response.isCompleted),
    responses: answers.map((r) => {
      const q = byQuestion.get(String(r.questionId));
      return {
        questionId: String(r.questionId),
        userAnswer: r.userAnswer,
        isCorrect: r.isCorrect,
        pointsEarned: r.pointsEarned,
        // An answered question can't be retried, so it's safe to reveal the key
        // once someone has got it wrong.
        correctAnswer: !r.isCorrect && q && q.type !== 'open-ended' ? q.correctAnswer : undefined,
        answerAudioId: (q && q.answerAudioId) || '',
      };
    }),
  };
};

// Activities for a book. Admins get the full documents (including answers);
// everyone else gets answer-free questions plus their own progress.
exports.getActivitiesByBook = async (req, res) => {
  const { bookId } = req.params;
  assertObjectId(bookId, 'book id');
  await assertCanOpenBook(req, bookId);
  const isAdmin = req.user.role === 'admin';

  const activities = await Activity.find({ bookId }).sort({ pageIndex: 1, createdAt: 1 }).lean();

  if (isAdmin) {
    return res.json(activities.map((a) => ({ ...a, questions: sortedQuestions(a.questions) })));
  }

  const responses = await ActivityResponse.find({ userId: req.user.id, bookId }).lean();
  const responseByActivity = new Map(responses.map((r) => [String(r.activityId), r]));

  res.json(
    activities.map((activity) => {
      const progress = summarizeProgress(activity, responseByActivity.get(String(activity._id)));
      return {
        ...activity,
        questions: sortedQuestions(activity.questions).map(hideAnswer),
        userProgress: progress,
        isCompleted: progress.isCompleted,
        progressPercentage: progress.total ? Math.round((progress.answered / progress.total) * 100) : 0,
      };
    })
  );
};

exports.submitActivityResponse = async (req, res) => {
  const userId = req.user.id;
  const { activityId } = req.params;
  assertObjectId(activityId, 'activity id');

  const { questionId } = req.body;
  const userAnswer = req.body.userAnswer == null ? '' : String(req.body.userAnswer).trim();

  if (!questionId || !userAnswer) {
    throw new HttpError(400, 'Question ID and answer are required');
  }
  if (userAnswer.length > 2000) {
    throw new HttpError(400, 'Answer is too long (max 2000 characters)');
  }

  const activity = await Activity.findById(activityId);
  if (!activity) throw new HttpError(404, 'Activity not found');
  await assertCanOpenBook(req, activity.bookId);

  const question = activity.questions.id(questionId);
  if (!question) throw new HttpError(404, 'Question not found');

  let activityResponse = await ActivityResponse.findOne({ userId, activityId });
  if (!activityResponse) {
    activityResponse = new ActivityResponse({
      userId,
      bookId: activity.bookId,
      activityId,
      pageIndex: activity.pageIndex,
      responses: [],
    });
  }

  if (activityResponse.responses.some((r) => String(r.questionId) === String(question._id))) {
    throw new HttpError(409, 'Question already answered');
  }

  const isCorrect = isAnswerCorrect(question, userAnswer);
  const pointsEarned = isCorrect ? question.points : 0;

  activityResponse.responses.push({
    questionId: String(question._id),
    userAnswer,
    isCorrect,
    pointsEarned,
  });
  activityResponse.totalPointsEarned = activityResponse.responses.reduce(
    (sum, r) => sum + r.pointsEarned,
    0
  );
  activityResponse.isCompleted = activityResponse.responses.length >= activity.questions.length;

  try {
    await activityResponse.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new HttpError(409, 'Your answers were being saved at the same time. Please try again.');
    }
    throw err;
  }

  res.json({
    message: isCorrect ? 'Correct answer' : 'Incorrect answer',
    isCorrect,
    pointsEarned,
    feedback: isCorrect ? question.correctFeedback : question.incorrectFeedback,
    hint: !isCorrect ? question.hint || null : null,
    correctAnswer: !isCorrect && question.type !== 'open-ended' ? question.correctAnswer : undefined,
    answerAudioId: question.answerAudioId || '',
    progress: {
      answered: activityResponse.responses.length,
      total: activity.questions.length,
      isCompleted: activityResponse.isCompleted,
      totalPointsEarned: activityResponse.totalPointsEarned,
    },
  });
};

exports.getActivityProgress = async (req, res) => {
  assertObjectId(req.params.activityId, 'activity id');
  const activity = await Activity.findById(req.params.activityId).lean();
  if (!activity) throw new HttpError(404, 'Activity not found');

  const response = await ActivityResponse.findOne({
    userId: req.user.id,
    activityId: activity._id,
  }).lean();

  res.json({
    activity: {
      title: activity.title,
      totalQuestions: activity.questions.length,
      totalPoints: activity.totalPoints,
    },
    userProgress: summarizeProgress(activity, response),
  });
};

exports.getActivityQuestions = async (req, res) => {
  assertObjectId(req.params.activityId, 'activity id');
  const activity = await Activity.findById(req.params.activityId).lean();
  if (!activity) throw new HttpError(404, 'Activity not found');
  await assertCanOpenBook(req, activity.bookId);

  const isAdmin = req.user.role === 'admin';
  const questions = sortedQuestions(activity.questions);

  res.json({
    activityTitle: activity.title,
    activityDescription: activity.description,
    instructions: activity.instructions,
    totalPoints: activity.totalPoints,
    questions: isAdmin ? questions : questions.map(hideAnswer),
  });
};

const mediaIdOrEmpty = (v) => {
  const id = v == null ? '' : String(v).trim();
  if (!id) return '';
  assertObjectId(id, 'media id');
  return id;
};

const mediaIdsOf = (questions) =>
  questions.flatMap((q) => [q.audioId, q.answerAudioId, ...(q.optionImages || [])]).filter(Boolean).map(String);

const cleanQuestions = async (questions, bookId) => {
  const wanted = []; // [mediaId, kind]
  const cleaned = questions.map((q, index) => {
    const options = Array.isArray(q.options) ? q.options : [];
    const audioId = mediaIdOrEmpty(q.audioId);
    const answerAudioId = mediaIdOrEmpty(q.answerAudioId);
    const optionImages = options.map((_, i) => mediaIdOrEmpty((q.optionImages || [])[i]));
    if (audioId) wanted.push([audioId, 'audio']);
    if (answerAudioId) wanted.push([answerAudioId, 'audio']);
    optionImages.forEach((id) => { if (id) wanted.push([id, 'image']); });
    return {
      ...q,
      audioId,
      answerAudioId,
      optionImages,
      order: index + 1,
      points: Number(q.points) > 0 ? Number(q.points) : 10,
      correctFeedback: q.correctFeedback || 'Great job! Your answer is correct!',
      incorrectFeedback: q.incorrectFeedback || 'Not quite right. Try again!',
    };
  });

  // Every sound / picture must be a file uploaded for THIS book, of the right kind.
  if (wanted.length) {
    const found = await Media.find({ _id: { $in: wanted.map(([id]) => id) }, bookId }).select('kind').lean();
    const kindById = new Map(found.map((m) => [String(m._id), m.kind]));
    for (const [id, kind] of wanted) {
      if (kindById.get(id) !== kind) throw new HttpError(400, `A ${kind} file in this quiz does not belong to this book.`);
    }
  }
  return cleaned;
};

const position = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'Position must be between 0 and 100.');
  return Math.round(n * 100) / 100;
};

exports.createActivity = async (req, res) => {
  const { bookId, pageIndex, title, description, instructions, questions } = req.body;

  if (!bookId || pageIndex == null || !title || !description) {
    throw new HttpError(400, 'Book ID, page index, title and description are required');
  }
  assertObjectId(bookId, 'book id');
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new HttpError(400, 'Questions are required');
  }

  const activity = await Activity.create({
    bookId,
    pageIndex,
    title,
    description,
    instructions: instructions || '',
    questions: await cleanQuestions(questions, bookId),
    x: position(req.body.x),
    y: position(req.body.y),
  });

  res.status(201).json(activity);
};

// After an activity is edited, drop answers to questions that no longer exist
// and recompute each student's totals and completion.
const reconcileResponses = async (activity) => {
  const validIds = new Set(activity.questions.map((q) => String(q._id)));
  const responses = await ActivityResponse.find({ activityId: activity._id });

  for (const response of responses) {
    response.responses = response.responses.filter((r) => validIds.has(String(r.questionId)));
    response.totalPointsEarned = response.responses.reduce((sum, r) => sum + r.pointsEarned, 0);
    response.isCompleted = response.responses.length >= activity.questions.length;
    await response.save();
  }
};

const EDITABLE_FIELDS = ['pageIndex', 'title', 'description', 'instructions'];

exports.updateActivity = async (req, res) => {
  assertObjectId(req.params.id);
  const activity = await Activity.findById(req.params.id);
  if (!activity) throw new HttpError(404, 'Activity not found');

  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) activity[field] = req.body[field];
  }

  const { questions } = req.body;
  let removed = [];
  if (questions !== undefined) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new HttpError(400, 'Questions are required');
    }
    // Questions that arrive with their existing _id keep it, so students'
    // saved answers stay attached to the right question.
    const before = mediaIdsOf(activity.questions);
    activity.questions = await cleanQuestions(questions, activity.bookId);
    removed = before.filter((id) => !mediaIdsOf(activity.questions).includes(id));
  }
  if (req.body.x !== undefined) activity.x = position(req.body.x);
  if (req.body.y !== undefined) activity.y = position(req.body.y);

  activity.updatedAt = Date.now();
  await activity.save();
  if (questions !== undefined) await reconcileResponses(activity);
  if (removed.length) await Media.deleteMany({ _id: { $in: removed } });

  res.json(activity);
};

exports.deleteActivity = async (req, res) => {
  assertObjectId(req.params.id);
  const activity = await Activity.findByIdAndDelete(req.params.id);
  if (!activity) throw new HttpError(404, 'Activity not found');

  await ActivityResponse.deleteMany({ activityId: activity._id });
  const files = mediaIdsOf(activity.questions || []);
  if (files.length) await Media.deleteMany({ _id: { $in: files } });
  res.json({ message: 'Activity deleted successfully' });
};

// Drag the quiz badge to a new spot on the page.
exports.moveActivity = async (req, res) => {
  assertObjectId(req.params.id);
  const activity = await Activity.findById(req.params.id);
  if (!activity) throw new HttpError(404, 'Activity not found');
  activity.x = position(req.body.x);
  activity.y = position(req.body.y);
  await activity.save();
  res.json({ x: activity.x, y: activity.y });
};
