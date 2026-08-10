import { delay } from "../config/constants.js";

let lastCallTime = 0;

export async function waitRateLimit() {
  const now = Date.now();
  const timeElapsed = now - lastCallTime;
  
  const waitTime = Math.max(delay - timeElapsed, 0);

  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastCallTime = Date.now();
}