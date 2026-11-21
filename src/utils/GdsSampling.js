/** Select a deterministic, per-layer sample spread across each layer's shapes. */
export function sampleGdsElementsByLayer(elements, limit) {
  if (elements.length <= limit) return elements;
  if (limit <= 0) return [];

  const byLayer = new Map();
  for (const element of elements) {
    const key = `${element.layer}/${element.datatype}`;
    const bucket = byLayer.get(key) ?? [];
    bucket.push(element);
    byLayer.set(key, bucket);
  }

  const buckets = [...byLayer.values()];
  const selected = [];
  const quotas = buckets.map((bucket) => Math.floor((bucket.length / elements.length) * limit));
  let remaining = limit - quotas.reduce((sum, quota) => sum + quota, 0);
  const priority = buckets
    .map((bucket, index) => ({ index, remainder: (bucket.length / elements.length) * limit - quotas[index] }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of priority) {
    if (!remaining) break;
    if (quotas[index] < buckets[index].length) {
      quotas[index] += 1;
      remaining -= 1;
    }
  }

  // Very small limits can be smaller than the number of layers. Give those
  // slots to the most populated layers so the sample still carries useful area.
  if (limit < buckets.length) {
    quotas.fill(0);
    buckets
      .map((bucket, index) => ({ index, length: bucket.length }))
      .sort((a, b) => b.length - a.length)
      .slice(0, limit)
      .forEach(({ index }) => { quotas[index] = 1; });
  }

  buckets.forEach((bucket, bucketIndex) => {
    const count = quotas[bucketIndex];
    for (let index = 0; index < count; index += 1) {
      const sampleIndex = Math.floor(((index + 0.5) * bucket.length) / count);
      selected.push(bucket[sampleIndex]);
    }
  });
  return selected;
}
