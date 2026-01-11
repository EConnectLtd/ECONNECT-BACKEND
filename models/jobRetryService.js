// /services/jobRetryService.js
const FailedJob = require('../models/FailedJob');
const { createNotification } = require('./notificationService');
const User = require('../models/User');

class JobRetryService {
  
  /**
   * Record a failed job
   */
  async recordFailedJob(jobType, error, metadata = {}) {
    try {
      const failedJob = await FailedJob.create({
        jobType,
        scheduledTime: new Date(),
        attemptCount: 1,
        maxAttempts: 3,
        lastAttemptAt: new Date(),
        nextRetryAt: new Date(Date.now() + 30 * 60 * 1000), // Retry in 30 minutes
        status: 'pending',
        errorMessage: error.message,
        errorStack: error.stack,
        metadata
      });

      console.log(`📝 Failed job recorded: ${failedJob._id}`);

      // Notify super admins immediately
      await this.notifySuperAdmins(jobType, failedJob._id, error.message);

      return failedJob;
    } catch (err) {
      console.error('❌ Error recording failed job:', err);
      throw err;
    }
  }

  /**
   * Retry failed jobs that are due
   */
  async retryFailedJobs() {
    try {
      const now = new Date();
      
      const jobsToRetry = await FailedJob.find({
        status: { $in: ['pending', 'retrying'] },
        nextRetryAt: { $lte: now },
        attemptCount: { $lt: 3 } // Max 3 attempts
      }).sort({ scheduledTime: 1 });

      console.log(`🔄 Found ${jobsToRetry.length} jobs to retry`);

      const results = {
        retried: 0,
        succeeded: 0,
        failed: 0,
        maxAttemptsReached: 0
      };

      for (const job of jobsToRetry) {
        try {
          console.log(`🔄 Retrying job: ${job._id} (Attempt ${job.attemptCount + 1}/3)`);

          // Update status
          job.status = 'retrying';
          job.attemptCount += 1;
          job.lastAttemptAt = new Date();
          await job.save();

          // Execute the job based on type
          let retryResult;
          switch (job.jobType) {
            case 'payment_reminder':
              retryResult = await this.retryPaymentReminders(job);
              break;
            // Add other job types here
            default:
              console.warn(`⚠️ Unknown job type: ${job.jobType}`);
              continue;
          }

          if (retryResult.success) {
            // Mark as resolved
            job.status = 'resolved';
            job.resolvedAt = new Date();
            job.resolution = `Successfully completed on attempt ${job.attemptCount}`;
            await job.save();

            results.succeeded++;
            console.log(`✅ Job ${job._id} succeeded on retry`);
          } else {
            // Failed again
            if (job.attemptCount >= job.maxAttempts) {
              // Max attempts reached
              job.status = 'failed';
              job.resolution = `Failed after ${job.maxAttempts} attempts`;
              await job.save();

              results.maxAttemptsReached++;
              console.error(`❌ Job ${job._id} failed permanently after ${job.maxAttempts} attempts`);

              // Notify admins of permanent failure
              await this.notifyPermanentFailure(job);
            } else {
              // Schedule next retry (exponential backoff)
              const backoffMinutes = Math.pow(2, job.attemptCount) * 30; // 30min, 1hr, 2hr
              job.nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
              job.status = 'pending';
              job.errorMessage = retryResult.error;
              await job.save();

              results.failed++;
              console.log(`⏰ Job ${job._id} will retry in ${backoffMinutes} minutes`);
            }
          }

          results.retried++;
        } catch (retryError) {
          console.error(`❌ Error retrying job ${job._id}:`, retryError);
          
          // Update error info
          job.errorMessage = retryError.message;
          job.errorStack = retryError.stack;
          
          if (job.attemptCount >= job.maxAttempts) {
            job.status = 'failed';
            results.maxAttemptsReached++;
          } else {
            job.status = 'pending';
            const backoffMinutes = Math.pow(2, job.attemptCount) * 30;
            job.nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
            results.failed++;
          }
          
          await job.save();
        }
      }

      console.log(`🔄 Retry summary:`, results);
      return results;
    } catch (error) {
      console.error('❌ Error in retry job service:', error);
      throw error;
    }
  }

  /**
   * Retry payment reminders specifically
   */
  async retryPaymentReminders(failedJob) {
    try {
      const { sendBulkPaymentReminders } = require('./paymentReminderService');
      
      const result = await sendBulkPaymentReminders();
      
      // Update metadata
      failedJob.metadata = {
        ...failedJob.metadata,
        totalUsers: result.total,
        successCount: result.sentCount,
        failedCount: result.failedCount,
        totalAmount: result.totalAmount
      };
      await failedJob.save();

      return {
        success: result.sentCount > 0,
        error: result.sentCount === 0 ? 'No reminders sent' : null
      };
    } catch (error) {
      console.error('❌ Payment reminder retry failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Notify super admins of job failure
   */
  async notifySuperAdmins(jobType, jobId, errorMessage) {
    try {
      const superAdmins = await User.find({ role: 'super_admin', isActive: true }).distinct('_id');

      const message = `Automated ${jobType} job failed: ${errorMessage}. Job ID: ${jobId}. The system will automatically retry.`;

      await Promise.all(
        superAdmins.map(adminId =>
          createNotification(
            adminId,
            `🚨 Automated Job Failed`,
            message,
            'error',
            `/admin/failed-jobs/${jobId}`
          )
        )
      );

      console.log(`📧 Notified ${superAdmins.length} super admins of job failure`);
    } catch (error) {
      console.error('❌ Error notifying admins:', error);
    }
  }

  /**
   * Notify of permanent failure
   */
  async notifyPermanentFailure(failedJob) {
    try {
      const superAdmins = await User.find({ role: 'super_admin', isActive: true }).distinct('_id');

      const message = `⚠️ CRITICAL: ${failedJob.jobType} job has PERMANENTLY FAILED after ${failedJob.maxAttempts} attempts. Manual intervention required. Job ID: ${failedJob._id}`;

      await Promise.all(
        superAdmins.map(adminId =>
          createNotification(
            adminId,
            `🚨 CRITICAL: Permanent Job Failure`,
            message,
            'error',
            `/admin/failed-jobs/${failedJob._id}`
          )
        )
      );

      console.log(`🚨 Notified admins of PERMANENT failure: ${failedJob._id}`);
    } catch (error) {
      console.error('❌ Error notifying permanent failure:', error);
    }
  }

  /**
   * Get failed jobs summary
   */
  async getFailedJobsSummary() {
    try {
      const summary = await FailedJob.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            byJobType: { $push: '$jobType' }
          }
        }
      ]);

      return summary;
    } catch (error) {
      console.error('❌ Error getting failed jobs summary:', error);
      throw error;
    }
  }
}

module.exports = new JobRetryService();