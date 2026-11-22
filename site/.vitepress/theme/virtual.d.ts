// The map of docs/*.md headings to API pages, built by the site configuration (see ../apiDocs.ts).
declare module 'virtual:vw-api-links' {
  const map: import('../apiDocs').ApiLinkMap
  export default map
}
