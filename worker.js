import { onRequestPost, onRequestOptions } from "./functions/api/gemini.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/gemini") {
      if (request.method === "OPTIONS") {
        return onRequestOptions();
      }
      if (request.method === "POST") {
        return onRequestPost({ request, env });
      }
      return new Response("Method not allowed", { status: 405 });
    }

    // كل المسارات الأخرى: خدم الملفات الثابتة
    return env.ASSETS.fetch(request);
  }
};
