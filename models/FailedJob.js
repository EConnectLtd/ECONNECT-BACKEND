// /models/FailedJob.js
const mongoose = require("mongoose");

const failedJobSchema = new mongoose.Schema(
  {
    jobType: {
      type: String,
      required: true,
      enum: [
        "payment_reminder",
        "monthly_billing",
        "sms_notification",
        "report_generation",
      ],
      index: true,
    },
    scheduledTime: {
      type: Date,
      required: true,
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    lastAttemptAt: Date,
    nextRetryAt: Date,
    status: {
      type: String,
      enum: ["pending", "retrying", "failed", "resolved"],
      default: "pending",
      index: true,
    },
    errorMessage: String,
    errorStack: String,
    affectedUsers: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["pending", "sent", "failed"] },
        error: String,
      },
    ],
    metadata: {
      totalUsers: Number,
      successCount: Number,
      failedCount: Number,
      totalAmount: Number,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolvedAt: Date,
    resolution: String,
  },
  {
    timestamps: true,
  }
);

// Index for quick lookups
failedJobSchema.index({ status: 1, nextRetryAt: 1 });
failedJobSchema.index({ jobType: 1, status: 1 });

module.exports = mongoose.model("FailedJob", failedJobSchema);
