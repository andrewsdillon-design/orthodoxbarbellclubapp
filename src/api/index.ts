// The one API client the app uses, switched between the real server and mock data by EXPO_PUBLIC_API_MODE.
import { API_BASE, API_MODE } from '../config';
import { createClient, fetchTransport } from './client';
import { mockTransport } from './mock';

let token: string | null = null;
let unauthorized: () => void = () => {};

export function setApiToken(t: string | null) {
  token = t;
}

export function onUnauthorized(fn: () => void) {
  unauthorized = fn;
}

export const api = createClient({
  transport: API_MODE === 'mock' ? mockTransport() : fetchTransport(API_BASE),
  getToken: () => token,
  onUnauthorized: () => unauthorized(),
});

export { ApiError, errorMessage, isOffline } from './client';
export type * from './types';
