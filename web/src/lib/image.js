/** Build responsive srcsets from a media object returned by the API. */
export function srcSet(media, format = 'webp') {
  if (!media) return undefined;
  const parts = media.sizes.map((s) => `${media.base}/${s.name}.${format} ${s.width}w`);
  const largest = media.sizes.at(-1)?.width || 0;
  if (format === 'jpg' && media.w > largest) parts.push(`${media.base}/original.jpg ${media.w}w`);
  return parts.join(', ');
}

/** Pick one URL closest to a target width (for backgrounds, zoom, OG tags). */
export function pickSrc(media, width = 800, format = 'webp') {
  if (!media) return '';
  if (width > (media.sizes.at(-1)?.width || 0) && media.w > (media.sizes.at(-1)?.width || 0)) return `${media.base}/original.jpg`;
  const s = media.sizes.find((x) => x.width >= width) || media.sizes.at(-1);
  return `${media.base}/${s.name}.${format}`;
}
