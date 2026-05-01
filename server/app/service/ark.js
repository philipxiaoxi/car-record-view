// server/app/service/ark.js
'use strict';

const OpenAI = require('openai');
const fs = require('fs');

class ArkService {
  constructor(config) {
    this.config = config;
    this.client = null;
  }

  // 获取 OpenAI 客户端（兼容火山引擎）
  getClient() {
    if (!this.client) {
      const apiKey = this.config.ark_api_key;
      const baseUrl = this.config.ark_base_url || 'https://ark.cn-beijing.volces.com/api/v3';

      if (!apiKey) {
        throw new Error('ARK_API_KEY 未配置，请在管理后台设置');
      }

      this.client = new OpenAI({
        baseURL: baseUrl,
        apiKey: apiKey,
      });
    }
    return this.client;
  }

  // 上传视频文件到火山引擎
  async uploadVideo(filePath, fps = 0.5) {
    const client = this.getClient();

    const file = await client.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'user_data',
    });

    console.log(`[Ark] 视频已上传: ${file.id}`);

    // 等待视频处理完成
    let fileInfo = file;
    while (fileInfo.status === 'processing') {
      await this.sleep(2000);
      fileInfo = await client.files.retrieve(file.id);
      console.log(`[Ark] 视频处理中: ${fileInfo.status}`);
    }

    if (fileInfo.status === 'error') {
      throw new Error('视频处理失败');
    }

    console.log(`[Ark] 视频处理完成: ${file.id}`);
    return fileInfo;
  }

  // 分析视频内容
  async analyzeVideo(fileId, prompt) {
    const client = this.getClient();
    const modelId = this.config.ark_model_id;

    if (!modelId) {
      throw new Error('ARK_MODEL_ID 未配置，请在管理后台设置');
    }

    const response = await client.responses.create({
      model: modelId,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_video', file_id: fileId },
            { type: 'input_text', text: prompt },
          ],
        },
      ],
    });

    return response;
  }

  // 辅助函数：延迟
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ArkService;
