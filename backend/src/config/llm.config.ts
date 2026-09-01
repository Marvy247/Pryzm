import { AiSdkLlm } from '@iqai/adk';
import { createOpenAI } from '@ai-sdk/openai';
import { config } from './env.config';

// Custom fetch to fix message formatting AND handle vision/images
const customFetch = async (url: string, options: any) => {
  let newUrl = url;
  if (url.includes('/responses')) {
    newUrl = url.replace('/responses', '/chat/completions');
  }

  if (options.method === 'POST' && options.body) {
    try {
      let body = JSON.parse(options.body);
      if (body.input && !body.messages) {
        body.messages = body.input;
        delete body.input;
      }
      if (body.messages) {
        body.messages = body.messages.map((msg: any) => {
          if (Array.isArray(msg.content)) {
            const text = msg.content
              .filter((c: any) => c.type === 'text' || c.type === 'input_text' || c.text)
              .map((c: any) => c.text)
              .join('\n');
            return { ...msg, content: text };
          }
          return msg;
        });
        options.body = JSON.stringify(body);
      }
    } catch (e) {
      // ignore transform errors
    }
  }

  const response = await fetch(newUrl, options);

  if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
    try {
      const clone = response.clone();
      const data = await clone.json();
      if (data.usage) {
        if (data.usage.input_tokens === undefined) {
          data.usage.input_tokens = data.usage.prompt_tokens || 0;
        }
        if (data.usage.output_tokens === undefined) {
          data.usage.output_tokens = data.usage.completion_tokens || 0;
        }
      }
      const newHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        newHeaders[key] = value;
      });
      delete newHeaders['content-encoding'];
      delete newHeaders['transfer-encoding'];
      delete newHeaders['content-length'];
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (e) {
      // ignore response transform errors
    }
  }

  return response;
};

const openaiProvider = createOpenAI({
  apiKey: config.OPENAI_API_KEY,
  baseURL: config.OPENAI_BASE_URL,
  fetch: customFetch,
} as any);

export const llm = new AiSdkLlm(openaiProvider.chat(config.OPENAI_MODEL));
export const scannerLlm = new AiSdkLlm(openaiProvider.chat(config.OPENAI_MODEL));
