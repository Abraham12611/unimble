declare global {
  interface ImportMeta {
    glob: (
      pattern: string,
      options?: {
        eager?: boolean;
        import?: string;
        as?: string;
        query?: string;
        exhaustive?: boolean;
      }
    ) => Record<string, () => Promise<unknown>>;
  }
}

export {};
