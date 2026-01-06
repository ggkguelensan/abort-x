/**
 * Example: abort-x integration with React Query (TanStack Query)
 *
 * This example demonstrates how to use abort-x with React Query for:
 * - Automatic request cancellation
 * - Retry with exponential backoff
 * - Timeout handling
 * - Combined abort signals
 *
 * Bundle size impact:
 * - This example adds approximately 2-3 KB (gzipped) to your bundle
 */

import { useQuery, useMutation, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { timeout, any, withRetry, isAborted, isTimeout, AbortScope } from 'abort-x';
import { useAbortController } from 'abort-x/react';

// ============================================
// Basic Usage: Query with Timeout
// ============================================

interface User {
  id: string;
  name: string;
  email: string;
}

/**
 * Simple query with timeout
 *
 * Size impact: ~800 B gzipped (timeout + isTimeout)
 */
export function useUserQuery(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: async ({ signal }) => {
      // Add 5 second timeout to React Query's signal
      const combinedSignal = any([
        signal,           // React Query's cancellation
        timeout(5000),    // Our timeout
      ]);

      const response = await fetch(`/api/users/${userId}`, {
        signal: combinedSignal,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }

      return response.json() as Promise<User>;
    },
    retry: (failureCount, error) => {
      // Don't retry on abort or timeout
      if (isAborted(error) || isTimeout(error)) {
        return false;
      }
      return failureCount < 3;
    },
  });
}

// ============================================
// Advanced: Retry with Backoff
// ============================================

interface Post {
  id: string;
  title: string;
  content: string;
}

/**
 * Query with automatic retry using abort-x
 *
 * Size impact: ~2.5 KB gzipped (withRetry + timeout + isAborted)
 */
export function usePostsQuery(userId: string) {
  return useQuery({
    queryKey: ['posts', userId],
    queryFn: async ({ signal }) => {
      // Use withRetry for fine-grained control
      return withRetry(
        async (attemptSignal) => {
          // Combine React Query's signal with attempt-specific signal
          const combinedSignal = any([signal, attemptSignal]);

          const response = await fetch(`/api/users/${userId}/posts`, {
            signal: combinedSignal,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return response.json() as Promise<Post[]>;
        },
        {
          attempts: 3,
          backoff: 'exponential',
          initialDelay: 1000,
          maxDelay: 5000,
          signal, // Pass React Query's signal to abort all retries
          onRetry: (attempt, error) => {
            console.log(`Retry ${attempt}:`, error.message);
          },
          shouldRetry: (error) => {
            // Don't retry on 4xx errors
            return !error.message.includes('4');
          },
        }
      );
    },
    // Disable React Query's built-in retry since we handle it
    retry: false,
  });
}

// ============================================
// Mutation with Manual Abort
// ============================================

interface CreatePostData {
  title: string;
  content: string;
}

/**
 * Mutation with manual abort capability
 *
 * Size impact: ~1 KB gzipped (useAbortController + timeout + any)
 */
export function useCreatePostMutation() {
  const controller = useAbortController();

  const mutation = useMutation({
    mutationFn: async (data: CreatePostData) => {
      const signal = any([
        controller.signal,
        timeout(30000), // 30 second timeout for mutations
      ]);

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal,
      });

      if (!response.ok) {
        throw new Error('Failed to create post');
      }

      return response.json() as Promise<Post>;
    },
  });

  return {
    ...mutation,
    abort: () => controller.abort(),
    isAborting: controller.signal.aborted,
  };
}

// ============================================
// Parallel Queries with Shared Scope
// ============================================

interface UserProfile {
  user: User;
  posts: Post[];
  followers: number;
}

/**
 * Fetch multiple related resources with shared abort scope
 *
 * Size impact: ~2 KB gzipped (AbortScope + timeout)
 */
export function useUserProfileQuery(userId: string) {
  return useQuery({
    queryKey: ['userProfile', userId],
    queryFn: async ({ signal }) => {
      const scope = new AbortScope(signal);

      try {
        // All requests share the same scope
        // If any fails or times out, all are cancelled
        const [user, posts, followers] = await scope.all([
          async (scopeSignal) => {
            const res = await fetch(`/api/users/${userId}`, {
              signal: any([scopeSignal, timeout(5000)]),
            });
            return res.json() as Promise<User>;
          },
          async (scopeSignal) => {
            const res = await fetch(`/api/users/${userId}/posts`, {
              signal: any([scopeSignal, timeout(5000)]),
            });
            return res.json() as Promise<Post[]>;
          },
          async (scopeSignal) => {
            const res = await fetch(`/api/users/${userId}/followers/count`, {
              signal: any([scopeSignal, timeout(5000)]),
            });
            const data = await res.json();
            return data.count as number;
          },
        ]);

        return { user, posts, followers } as UserProfile;
      } finally {
        scope.dispose();
      }
    },
  });
}

// ============================================
// Infinite Query with Per-Page Timeout
// ============================================

interface PostsPage {
  posts: Post[];
  nextCursor?: string;
}

/**
 * Infinite query with per-page timeout
 */
export function useInfinitePostsQuery() {
  return useQuery({
    queryKey: ['infinitePosts'],
    queryFn: async ({ signal, pageParam = undefined }) => {
      const url = new URL('/api/posts', window.location.origin);
      if (pageParam) {
        url.searchParams.set('cursor', pageParam);
      }

      // Each page has its own timeout
      const pageSignal = any([
        signal,
        timeout(10000),
      ]);

      const response = await fetch(url.toString(), { signal: pageSignal });

      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }

      return response.json() as Promise<PostsPage>;
    },
  });
}

// ============================================
// Custom Hook: Query with Progress
// ============================================

import { AbortX } from 'abort-x';

/**
 * Query with progress tracking (for large responses)
 *
 * Size impact: ~2.5 KB gzipped (AbortX builder)
 */
export function useLargeDataQuery(dataId: string) {
  return useQuery({
    queryKey: ['largeData', dataId],
    queryFn: async ({ signal }) => {
      const { signal: progressSignal, update } = AbortX.create()
        .timeout(60000) // 60 second timeout
        .with(signal)
        .buildWithProgress();

      const response = await fetch(`/api/large-data/${dataId}`, {
        signal: progressSignal,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch');
      }

      // Track download progress
      const reader = response.body?.getReader();
      const contentLength = Number(response.headers.get('Content-Length')) || 0;

      if (!reader) {
        return response.json();
      }

      let receivedLength = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        // Update progress
        if (contentLength > 0) {
          update(receivedLength / contentLength);
        }
      }

      const text = new TextDecoder().decode(
        new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
      );

      return JSON.parse(text);
    },
  });
}

// ============================================
// Example Component
// ============================================

export function UserProfileComponent({ userId }: { userId: string }) {
  const { data, isLoading, error, refetch } = useUserProfileQuery(userId);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    if (isTimeout(error)) {
      return (
        <div>
          <p>Request timed out</p>
          <button onClick={() => refetch()}>Retry</button>
        </div>
      );
    }

    if (isAborted(error)) {
      return <div>Request was cancelled</div>;
    }

    return <div>Error: {error.message}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div>
      <h1>{data.user.name}</h1>
      <p>{data.user.email}</p>
      <p>{data.followers} followers</p>
      <h2>Posts</h2>
      <ul>
        {data.posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}

// ============================================
// Size-Tracking Test Case
// ============================================

/**
 * This file is used to measure the bundle size impact of using abort-x
 * with React Query.
 *
 * Minimal imports for size tracking:
 */
export { timeout, any, isAborted, isTimeout } from 'abort-x';

/**
 * Expected bundle size additions:
 *
 * | Import | Minified | Gzipped |
 * |--------|----------|---------|
 * | timeout | ~400 B | ~250 B |
 * | any | ~500 B | ~300 B |
 * | isAborted + isTimeout | ~200 B | ~150 B |
 * | withRetry | ~1.5 KB | ~800 B |
 * | AbortScope | ~1.2 KB | ~700 B |
 * | AbortX (builder) | ~1.8 KB | ~900 B |
 * | useAbortController | ~300 B | ~200 B |
 *
 * Typical integration: ~1-2 KB gzipped
 */
