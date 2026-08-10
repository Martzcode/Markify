import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a message', () => {
    service.show('hello');
    expect(service.message()).toBe('hello');
  });

  it('clears the message after the duration', () => {
    service.show('hello', 2000);
    expect(service.message()).toBe('hello');

    vi.advanceTimersByTime(2000);
    expect(service.message()).toBeNull();
  });

  it('restarts the timer when shown again', () => {
    service.show('first', 5000);
    vi.advanceTimersByTime(3000);
    service.show('second', 2000);
    vi.advanceTimersByTime(1999);
    expect(service.message()).toBe('second');

    vi.advanceTimersByTime(1);
    expect(service.message()).toBeNull();
  });
});
