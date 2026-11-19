declare module '@supabase/ssr/dist/main/createServerClient.js' {
  type Cookie = { name: string; value: string; options?: Record<string, unknown> };
  export function createServerClient(url: string, key: string, options: {
    cookies: { getAll(): Cookie[]; setAll(values: Cookie[]): void };
  }): any;
}
declare module '@supabase/ssr/dist/main/createBrowserClient.js' {
  export function createBrowserClient(url: string, key: string): any;
}
