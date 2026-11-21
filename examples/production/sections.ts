// Read an excerpt of the code running this demo. Markers live in the source so they move with the implementation.
export function excerpt(source: string, section: string) {
  return source.split('// demo:' + section + '\n')[1]?.split('// demo:end')[0]?.trim()
    ?? source.split('<!-- demo:' + section + ' -->')[1]?.split('<!-- demo:end -->')[0]?.trim()
    ?? ''
}
