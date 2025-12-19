import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Get method color class
 */
export function getMethodClass(method: string): string {
    const m = method.toUpperCase();
    switch (m) {
        case 'GET':
            return 'method-get';
        case 'POST':
            return 'method-post';
        case 'PUT':
            return 'method-put';
        case 'PATCH':
            return 'method-patch';
        case 'DELETE':
            return 'method-delete';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

/**
 * Get status color class
 */
export function getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    if (status >= 500) return 'status-5xx';
    return 'bg-gray-100 text-gray-800';
}

/**
 * Format timestamp
 */
export function formatTimestamp(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        return date.toLocaleString();
    } catch {
        return timestamp;
    }
}

/**
 * Format relative time
 */
export function formatRelativeTime(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'just now';
    } catch {
        return timestamp;
    }
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}
