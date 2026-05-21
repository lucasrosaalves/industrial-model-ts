export function chunks<TItem>(items: TItem[], size: number): TItem[][] {
  const result: TItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
