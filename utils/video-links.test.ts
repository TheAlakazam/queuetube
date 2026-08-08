import { describe, expect, it } from 'vitest';
import { classifyVideoLink } from './video-links';

describe('classifyVideoLink', () => {
  it('classifies a plain watch link', () => {
    expect(classifyVideoLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      type: 'watch',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('classifies a relative watch link', () => {
    expect(classifyVideoLink('/watch?v=dQw4w9WgXcQ')).toEqual({
      type: 'watch',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('keeps extra params like t= on a watch link', () => {
    expect(classifyVideoLink('/watch?v=dQw4w9WgXcQ&t=30s')).toEqual({
      type: 'watch',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('ignores a watch link carrying a list= (playlist navigation)', () => {
    expect(classifyVideoLink('/watch?v=dQw4w9WgXcQ&list=PL123')).toEqual({ type: 'ignore' });
  });

  it('ignores a watch link with no v=', () => {
    expect(classifyVideoLink('/watch?list=PL123')).toEqual({ type: 'ignore' });
  });

  it('classifies a Shorts link', () => {
    expect(classifyVideoLink('/shorts/abc123XYZ_')).toEqual({
      type: 'shorts',
      videoId: 'abc123XYZ_',
    });
  });

  it('classifies a Shorts link with trailing query params', () => {
    expect(classifyVideoLink('/shorts/abc123XYZ_?feature=share')).toEqual({
      type: 'shorts',
      videoId: 'abc123XYZ_',
    });
  });

  it('ignores a plain playlist link', () => {
    expect(classifyVideoLink('/playlist?list=PL123')).toEqual({ type: 'ignore' });
  });

  it('ignores a channel link', () => {
    expect(classifyVideoLink('/@somechannel')).toEqual({ type: 'ignore' });
  });

  it('ignores the home page', () => {
    expect(classifyVideoLink('/')).toEqual({ type: 'ignore' });
  });

  it('ignores a malformed href', () => {
    expect(classifyVideoLink('not a url::')).toEqual({ type: 'ignore' });
  });
});
