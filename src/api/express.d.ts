declare global {
  namespace Express {
    interface Request {
      /** Correlation id, echoed back on every response as `x-request-id`. */
      id: string;
      startedAt: number;
    }
  }
}

export {};
