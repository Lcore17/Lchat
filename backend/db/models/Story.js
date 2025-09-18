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


const reactionSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	type: { type: String, enum: ['like', 'love', 'laugh', 'wow', 'sad', 'angry', 'emoji'], default: 'like' },
	emoji: { type: String, default: null }, // for custom emoji reactions
}, { _id: false });

const commentSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	user: { type: String, required: true },
	text: { type: String, required: true },
	createdAt: { type: Number, default: () => Date.now() },
}, { _id: false });

const storySchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		user: { type: String, required: true },
		content: { type: String, default: '' },
		imageUri: { type: String, default: null },
		createdAt: { type: Number, default: () => Date.now(), index: true },
		poll: { type: pollSchema, default: undefined },
		reactions: { type: [reactionSchema], default: [] }, // story reactions
		comments: { type: [commentSchema], default: [] }, // story comments
		edited: { type: Boolean, default: false }, // story editing
		deleted: { type: Boolean, default: false }, // story deletion
		viewers: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] }, // story analytics
		viewCount: { type: Number, default: 0 }, // story analytics
		lastEditedAt: { type: Number, default: null },
		deletedAt: { type: Number, default: null },
	},
	{ versionKey: false }
);

module.exports = mongoose.model('Story', storySchema);

