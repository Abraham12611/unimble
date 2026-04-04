import { httpRouter } from "convex/server";
import { clerkWebhook } from "./webhooks";

const http = httpRouter();

http.route({
  path: "/clerk",
  method: "POST",
  handler: clerkWebhook,
});

export default http;
