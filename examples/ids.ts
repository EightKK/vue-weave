/** The first number from `from` on for which `prefix + number` is not the ID of an item, for the ID of a new item. */
export function unusedNumber(items: readonly { id: string }[], prefix: string, from = 1) {
  let number = from
  while (items.some(item => item.id === prefix + number)) number++
  return number
}
