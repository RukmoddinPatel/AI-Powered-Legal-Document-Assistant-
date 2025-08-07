// controllers/advocateDiaryController.js
const { AdvocateDiary, CaseSchedule, User } = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const { sendReminder } = require('../utils/notificationHelper');

class AdvocateDiaryController {
  // Create diary entry
  async createEntry(req, res) {
    try {
      const {
        title,
        caseNumber,
        clientName,
        description,
        category = 'other',
        priority = 'medium',
        reminderDate,
        tags = [],
        attachments = []
      } = req.body;

      const userId = req.user.id;

      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const entry = await AdvocateDiary.create({
        userId,
        title,
        caseNumber,
        clientName,
        description,
        category,
        priority,
        status: 'pending',
        reminderDate: reminderDate ? new Date(reminderDate) : null,
        tags,
        attachments,
        isArchived: false
      });

      res.json({
        success: true,
        entry,
        message: 'Diary entry created successfully'
      });
    } catch (error) {
      console.error('Create diary entry error:', error);
      res.status(500).json({
        error: 'Failed to create diary entry',
        details: error.message
      });
    }
  }

  // Get user's diary entries
  async getEntries(req, res) {
    try {
      const userId = req.user.id;
      const {
        page = 1,
        limit = 10,
        category,
        priority,
        status,
        search,
        startDate,
        endDate,
        archived = false
      } = req.query;

      const offset = (page - 1) * limit;
      let whereClause = { 
        userId,
        isArchived: archived === 'true'
      };

      // Apply filters
      if (category) {
        whereClause.category = category;
      }

      if (priority) {
        whereClause.priority = priority;
      }

      if (status) {
        whereClause.status = status;
      }

      if (search) {
        whereClause[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
          { caseNumber: { [Op.iLike]: `%${search}%` } },
          { clientName: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          whereClause.createdAt[Op.lte] = new Date(endDate);
        }
      }

      const { count, rows: entries } = await AdvocateDiary.findAndCountAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        entries,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get diary entries error:', error);
      res.status(500).json({
        error: 'Failed to fetch diary entries',
        details: error.message
      });
    }
  }

  // Update diary entry
  async updateEntry(req, res) {
    try {
      const { entryId } = req.params;
      const userId = req.user.id;
      const updateData = req.body;

      const entry = await AdvocateDiary.findOne({
        where: { id: entryId, userId }
      });

      if (!entry) {
        return res.status(404).json({ error: 'Diary entry not found' });
      }

      await entry.update(updateData);

      res.json({
        success: true,
        entry,
        message: 'Diary entry updated successfully'
      });
    } catch (error) {
      console.error('Update diary entry error:', error);
      res.status(500).json({
        error: 'Failed to update diary entry',
        details: error.message
      });
    }
  }

  // Delete diary entry
  async deleteEntry(req, res) {
    try {
      const { entryId } = req.params;
      const userId = req.user.id;

      const entry = await AdvocateDiary.findOne({
        where: { id: entryId, userId }
      });

      if (!entry) {
        return res.status(404).json({ error: 'Diary entry not found' });
      }

      await entry.destroy();

      res.json({
        success: true,
        message: 'Diary entry deleted successfully'
      });
    } catch (error) {
      console.error('Delete diary entry error:', error);
      res.status(500).json({
        error: 'Failed to delete diary entry',
        details: error.message
      });
    }
  }

  // Archive/Unarchive entry
  async toggleArchive(req, res) {
    try {
      const { entryId } = req.params;
      const userId = req.user.id;

      const entry = await AdvocateDiary.findOne({
        where: { id: entryId, userId }
      });

      if (!entry) {
        return res.status(404).json({ error: 'Diary entry not found' });
      }

      await entry.update({ isArchived: !entry.isArchived });

      res.json({
        success: true,
        entry,
        message: `Diary entry ${entry.isArchived ? 'archived' : 'unarchived'} successfully`
      });
    } catch (error) {
      console.error('Toggle archive error:', error);
      res.status(500).json({
        error: 'Failed to toggle archive status',
        details: error.message
      });
    }
  }

  // Create case schedule
  async createSchedule(req, res) {
    try {
      const {
        title,
        caseNumber,
        court,
        judge,
        eventType,
        scheduledDate,
        duration,
        location,
        description,
        reminderTime = 30,
        isRecurring = false,
        recurrencePattern = null,
        participants = []
      } = req.body;

      const userId = req.user.id;

      if (!title || !eventType || !scheduledDate) {
        return res.status(400).json({ 
          error: 'Title, event type, and scheduled date are required' 
        });
      }

      const schedule = await CaseSchedule.create({
        userId,
        title,
        caseNumber,
        court,
        judge,
        eventType,
        scheduledDate: new Date(scheduledDate),
        duration,
        location,
        description,
        reminderTime,
        isRecurring,
        recurrencePattern,
        status: 'scheduled',
        participants
      });

      res.json({
        success: true,
        schedule,
        message: 'Schedule created successfully'
      });
    } catch (error) {
      console.error('Create schedule error:', error);
      res.status(500).json({
        error: 'Failed to create schedule',
        details: error.message
      });
    }
  }

  // Get schedules (calendar view)
  async getSchedules(req, res) {
    try {
      const userId = req.user.id;
      const {
        startDate,
        endDate,
        eventType,
        status = 'scheduled',
        view = 'month'
      } = req.query;

      let whereClause = { userId };

      if (eventType) {
        whereClause.eventType = eventType;
      }

      if (status) {
        whereClause.status = status;
      }

      // Date range filter
      if (startDate && endDate) {
        whereClause.scheduledDate = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      } else {
        // Default to current month if no date range specified
        const now = moment();
        const monthStart = now.clone().startOf('month').toDate();
        const monthEnd = now.clone().endOf('month').toDate();
        
        whereClause.scheduledDate = {
          [Op.between]: [monthStart, monthEnd]
        };
      }

      const schedules = await CaseSchedule.findAll({
        where: whereClause,
        order: [['scheduledDate', 'ASC']]
      });

      // Group schedules by date for calendar view
      const groupedSchedules = schedules.reduce((acc, schedule) => {
        const date = moment(schedule.scheduledDate).format('YYYY-MM-DD');
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(schedule);
        return acc;
      }, {});

      res.json({
        success: true,
        schedules: groupedSchedules,
        totalEvents: schedules.length,
        view,
        dateRange: {
          start: startDate || moment().startOf('month').format('YYYY-MM-DD'),
          end: endDate || moment().endOf('month').format('YYYY-MM-DD')
        }
      });
    } catch (error) {
      console.error('Get schedules error:', error);
      res.status(500).json({
        error: 'Failed to fetch schedules',
        details: error.message
      });
    }
  }

  // Update schedule
  async updateSchedule(req, res) {
    try {
      const { scheduleId } = req.params;
      const userId = req.user.id;
      const updateData = req.body;

      const schedule = await CaseSchedule.findOne({
        where: { id: scheduleId, userId }
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      if (updateData.scheduledDate) {
        updateData.scheduledDate = new Date(updateData.scheduledDate);
      }

      await schedule.update(updateData);

      res.json({
        success: true,
        schedule,
        message: 'Schedule updated successfully'
      });
    } catch (error) {
      console.error('Update schedule error:', error);
      res.status(500).json({
        error: 'Failed to update schedule',
        details: error.message
      });
    }
  }

  // Delete schedule
  async deleteSchedule(req, res) {
    try {
      const { scheduleId } = req.params;
      const userId = req.user.id;

      const schedule = await CaseSchedule.findOne({
        where: { id: scheduleId, userId }
      });

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      await schedule.destroy();

      res.json({
        success: true,
        message: 'Schedule deleted successfully'
      });
    } catch (error) {
      console.error('Delete schedule error:', error);
      res.status(500).json({
        error: 'Failed to delete schedule',
        details: error.message
      });
    }
  }

  // Get upcoming reminders
  async getUpcomingReminders(req, res) {
    try {
      const userId = req.user.id;
      const { days = 7 } = req.query;

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + parseInt(days));

      // Get diary entries with reminders
      const diaryReminders = await AdvocateDiary.findAll({
        where: {
          userId,
          reminderDate: {
            [Op.between]: [now, futureDate]
          },
          isArchived: false
        },
        order: [['reminderDate', 'ASC']]
      });

      // Get upcoming schedules
      const scheduleReminders = await CaseSchedule.findAll({
        where: {
          userId,
          scheduledDate: {
            [Op.between]: [now, futureDate]
          },
          status: 'scheduled'
        },
        order: [['scheduledDate', 'ASC']]
      });

      // Combine and format reminders
      const allReminders = [
        ...diaryReminders.map(entry => ({
          id: entry.id,
          type: 'diary',
          title: entry.title,
          description: entry.description,
          reminderDate: entry.reminderDate,
          priority: entry.priority,
          caseNumber: entry.caseNumber,
          clientName: entry.clientName
        })),
        ...scheduleReminders.map(schedule => ({
          id: schedule.id,
          type: 'schedule',
          title: schedule.title,
          description: schedule.description,
          reminderDate: moment(schedule.scheduledDate).subtract(schedule.reminderTime, 'minutes').toDate(),
          eventType: schedule.eventType,
          court: schedule.court,
          judge: schedule.judge,
          scheduledDate: schedule.scheduledDate
        }))
      ].sort((a, b) => new Date(a.reminderDate) - new Date(b.reminderDate));

      res.json({
        success: true,
        reminders: allReminders,
        totalReminders: allReminders.length,
        timeframe: `${days} days`
      });
    } catch (error) {
      console.error('Get upcoming reminders error:', error);
      res.status(500).json({
        error: 'Failed to fetch upcoming reminders',
        details: error.message
      });
    }
  }

  // Get dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const userId = req.user.id;
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const stats = await Promise.all([
        // Total diary entries
        AdvocateDiary.count({ where: { userId, isArchived: false } }),
        
        // Pending tasks
        AdvocateDiary.count({ where: { userId, status: 'pending', isArchived: false } }),
        
        // Completed tasks this week
        AdvocateDiary.count({ 
          where: { 
            userId, 
            status: 'completed',
            updatedAt: { [Op.gte]: weekAgo }
          } 
        }),
        
        // Upcoming schedules (next 7 days)
        CaseSchedule.count({
          where: {
            userId,
            scheduledDate: {
              [Op.between]: [now, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)]
            },
            status: 'scheduled'
          }
        }),
        
        // High priority pending items
        AdvocateDiary.count({ 
          where: { 
            userId, 
            priority: 'high',
            status: 'pending',
            isArchived: false
          } 
        }),
        
        // Recent activity (last 30 days)
        AdvocateDiary.findAll({
          where: {
            userId,
            createdAt: { [Op.gte]: monthAgo }
          },
          attributes: ['category', 'status'],
          raw: true
        })
      ]);

      const [
        totalEntries,
        pendingTasks,
        completedThisWeek,
        upcomingSchedules,
        highPriorityPending,
        recentActivity
      ] = stats;

      // Calculate category breakdown
      const categoryBreakdown = recentActivity.reduce((acc, entry) => {
        acc[entry.category] = (acc[entry.category] || 0) + 1;
        return acc;
      }, {});

      // Calculate completion rate
      const completedTasks = recentActivity.filter(entry => entry.status === 'completed').length;
      const completionRate = recentActivity.length > 0 
        ? Math.round((completedTasks / recentActivity.length) * 100) 
        : 0;

      res.json({
        success: true,
        statistics: {
          totalEntries,
          pendingTasks,
          completedThisWeek,
          upcomingSchedules,
          highPriorityPending,
          completionRate,
          categoryBreakdown,
          recentActivityCount: recentActivity.length
        }
      });
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch dashboard statistics',
        details: error.message
      });
    }
  }

  // Search entries and schedules
  async searchAll(req, res) {
    try {
      const userId = req.user.id;
      const { query, type = 'all', limit = 20 } = req.query;

      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      const searchCondition = {
        [Op.or]: [
          { title: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } },
          { caseNumber: { [Op.iLike]: `%${query}%` } }
        ]
      };

      let results = [];

      // Search diary entries
      if (type === 'all' || type === 'diary') {
        const diaryResults = await AdvocateDiary.findAll({
          where: {
            userId,
            ...searchCondition,
            isArchived: false
          },
          limit: type === 'diary' ? parseInt(limit) : Math.floor(parseInt(limit) / 2),
          order: [['updatedAt', 'DESC']]
        });

        results.push(...diaryResults.map(entry => ({
          ...entry.toJSON(),
          resultType: 'diary'
        })));
      }

      // Search schedules
      if (type === 'all' || type === 'schedule') {
        const scheduleCondition = {
          ...searchCondition,
          [Op.or]: [
            ...searchCondition[Op.or],
            { court: { [Op.iLike]: `%${query}%` } },
            { judge: { [Op.iLike]: `%${query}%` } }
          ]
        };

        const scheduleResults = await CaseSchedule.findAll({
          where: {
            userId,
            ...scheduleCondition
          },
          limit: type === 'schedule' ? parseInt(limit) : Math.floor(parseInt(limit) / 2),
          order: [['scheduledDate', 'DESC']]
        });

        results.push(...scheduleResults.map(schedule => ({
          ...schedule.toJSON(),
          resultType: 'schedule'
        })));
      }

      // Sort combined results by relevance/date
      results.sort((a, b) => {
        const dateA = new Date(a.resultType === 'diary' ? a.updatedAt : a.scheduledDate);
        const dateB = new Date(b.resultType === 'diary' ? b.updatedAt : b.scheduledDate);
        return dateB - dateA;
      });

      res.json({
        success: true,
        results: results.slice(0, parseInt(limit)),
        totalResults: results.length,
        searchQuery: query,
        searchType: type
      });
    } catch (error) {
      console.error('Search all error:', error);
      res.status(500).json({
        error: 'Failed to search entries and schedules',
        details: error.message
      });
    }
  }

  // Export data (CSV/PDF)
  async exportData(req, res) {
    try {
      const userId = req.user.id;
      const { format = 'csv', type = 'all', startDate, endDate } = req.query;

      let whereClause = { userId };
      
      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          whereClause.createdAt[Op.lte] = new Date(endDate);
        }
      }

      let exportData = [];

      if (type === 'all' || type === 'diary') {
        const diaryEntries = await AdvocateDiary.findAll({
          where: whereClause,
          order: [['createdAt', 'DESC']]
        });

        exportData.push(...diaryEntries.map(entry => ({
          type: 'Diary Entry',
          title: entry.title,
          caseNumber: entry.caseNumber || 'N/A',
          clientName: entry.clientName || 'N/A',
          category: entry.category,
          priority: entry.priority,
          status: entry.status,
          description: entry.description,
          reminderDate: entry.reminderDate ? moment(entry.reminderDate).format('YYYY-MM-DD HH:mm') : 'N/A',
          createdAt: moment(entry.createdAt).format('YYYY-MM-DD HH:mm')
        })));
      }

      if (type === 'all' || type === 'schedule') {
        const schedules = await CaseSchedule.findAll({
          where: {
            userId,
            ...(startDate || endDate ? {
              scheduledDate: {
                ...(startDate && { [Op.gte]: new Date(startDate) }),
                ...(endDate && { [Op.lte]: new Date(endDate) })
              }
            } : {})
          },
          order: [['scheduledDate', 'DESC']]
        });

        exportData.push(...schedules.map(schedule => ({
          type: 'Schedule',
          title: schedule.title,
          caseNumber: schedule.caseNumber || 'N/A',
          court: schedule.court || 'N/A',
          judge: schedule.judge || 'N/A',
          eventType: schedule.eventType,
          scheduledDate: moment(schedule.scheduledDate).format('YYYY-MM-DD HH:mm'),
          duration: schedule.duration ? `${schedule.duration} minutes` : 'N/A',
          location: schedule.location || 'N/A',
          status: schedule.status,
          description: schedule.description || 'N/A'
        })));
      }

      if (format === 'csv') {
        // Generate CSV
        const csv = this.generateCSV(exportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="advocate-diary-${Date.now()}.csv"`);
        res.send(csv);
      } else {
        // For now, return JSON (PDF generation would require additional libraries)
        res.json({
          success: true,
          data: exportData,
          format,
          exportedAt: new Date().toISOString(),
          totalRecords: exportData.length
        });
      }
    } catch (error) {
      console.error('Export data error:', error);
      res.status(500).json({
        error: 'Failed to export data',
        details: error.message
      });
    }
  }

  // Mark task as completed
  async markCompleted(req, res) {
    try {
      const { entryId } = req.params;
      const userId = req.user.id;

      const entry = await AdvocateDiary.findOne({
        where: { id: entryId, userId }
      });

      if (!entry) {
        return res.status(404).json({ error: 'Diary entry not found' });
      }

      await entry.update({ status: 'completed' });

      res.json({
        success: true,
        entry,
        message: 'Task marked as completed'
      });
    } catch (error) {
      console.error('Mark completed error:', error);
      res.status(500).json({
        error: 'Failed to mark task as completed',
        details: error.message
      });
    }
  }

  // Bulk operations
  async bulkUpdate(req, res) {
    try {
      const { entryIds, action, updateData = {} } = req.body;
      const userId = req.user.id;

      if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
        return res.status(400).json({ error: 'Entry IDs array is required' });
      }

      const entries = await AdvocateDiary.findAll({
        where: {
          id: { [Op.in]: entryIds },
          userId
        }
      });

      if (entries.length === 0) {
        return res.status(404).json({ error: 'No entries found' });
      }

      let updateObject = {};

      switch (action) {
        case 'archive':
          updateObject.isArchived = true;
          break;
        case 'unarchive':
          updateObject.isArchived = false;
          break;
        case 'complete':
          updateObject.status = 'completed';
          break;
        case 'update':
          updateObject = updateData;
          break;
        default:
          return res.status(400).json({ error: 'Invalid action' });
      }

      await AdvocateDiary.update(updateObject, {
        where: {
          id: { [Op.in]: entryIds },
          userId
        }
      });

      res.json({
        success: true,
        updatedCount: entries.length,
        action,
        message: `Bulk ${action} completed successfully`
      });
    } catch (error) {
      console.error('Bulk update error:', error);
      res.status(500).json({
        error: 'Failed to perform bulk update',
        details: error.message
      });
    }
  }

  // Helper method to generate CSV
  generateCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          return `"${value.toString().replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    return csvContent;
  }
}

module.exports = new AdvocateDiaryController();