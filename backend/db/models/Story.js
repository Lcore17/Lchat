const mongoose = require('mongoose');

const pollOptionSchema = new mongoose.Schema(
	{
        id: { type: Number, required: true },
        text: { type: String, required: true },
        votes: { type: Number, default: 0 },
    },
       { _id: false }
);

const pollSchema = new mongoose.Schema(
	{
		question: { type: String, required: true },
		options: { type: [pollOptionSchema], default: [] },
		votedOptionId: { type: Number },
		votesByUser: { type: Object, default: {} }, // userId: optionId
	},
	{ _id: false }
);

const storySchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		user: { type: String, required: true },
		content: { type: String, default: '' },
		imageUri: { type: String, default: null },
		createdAt: { type: Number, default: () => Date.now(), index: true },
		poll: { type: pollSchema, default: undefined },
	},
	{ versionKey: false }
);

module.exports = mongoose.model('Story', storySchema);

