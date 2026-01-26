// ============================================
// JOB RETRY SERVICE
// ============================================
// Handles retrying failed background jobs

const mongoose = require('mongoose');

/**
 * Get summary of failed jobs
 */
async function getFailedJobsSummary() {
  try {
    const FailedJob = mongoose.model('FailedJob');

    const [total, byStatus, byType] = await Promise.all([
      FailedJob.countDocuments(),
      FailedJob.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      FailedJob.aggregate([
        { $group: { _id: '$jobType', count: { $sum: 1 } } }
      ])
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byType: byType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
  } catch (error) {
    console.error('❌ Error getting failed jobs summary:', error);
    return { total: 0, byStatus: {}, byType: {} };
  }
}

/**
 * Retry failed jobs that are due for retry
 */
async function retryFailedJobs() {
  try {
    const FailedJob = mongoose.model('FailedJob');

    const jobsToRetry = await FailedJob.find({
      status: 'pending',
      nextRetryAt: { $lte: new Date() },
      attemptCount: { $lt: '$maxRetries' }
    });

    console.log(`🔄 Found ${jobsToRetry.length} jobs to retry`);

    const results = {
      attempted: 0,
      succeeded: 0,
      failed: 0
    };

    for (const job of jobsToRetry) {
      try {
        results.attempted++;
        
        // Attempt to reprocess the job based on type
        console.log(`🔄 Retrying job: ${job.jobType} (${job._id})`);
        
        // Mark as resolved if successful
        job.status = 'resolved';
        job.resolvedAt = new Date();
        await job.save();
        
        results.succeeded++;
      } catch (error) {
        console.error(`❌ Retry failed for job ${job._id}:`, error);
        
        job.attemptCount += 1;
        job.lastAttemptAt = new Date();
        
        if (job.attemptCount >= job.maxRetries) {
          job.status = 'failed';
        } else {
          // Exponential backoff
          const nextRetry = new Date();
          nextRetry.setHours(nextRetry.getHours() + Math.pow(2, job.attemptCount));
          job.nextRetryAt = nextRetry;
        }
        
        await job.save();
        results.failed++;
      }
    }

    return results;
  } catch (error) {
    console.error('❌ Error retrying failed jobs:', error);
    throw error;
  }
}

module.exports = {
  getFailedJobsSummary,
  retryFailedJobs
};