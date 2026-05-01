// server/app/schedule/process_analysis.js
'use strict';

const Subscription = require('egg').Subscription;
const analysisService = require('../service/analysis');

class ProcessAnalysis extends Subscription {
  static get schedule() {
    return {
      interval: '10s',
      type: 'worker',
    };
  }

  async subscribe() {
    await analysisService.processQueue(this.app.config);
  }
}

module.exports = ProcessAnalysis;
