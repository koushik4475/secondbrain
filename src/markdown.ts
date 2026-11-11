import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })
markdown.renderer.rules.image = () => ''
markdown.core.ruler.after('inline', 'task-checkbox-markers', (state) => {
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.children) continue
    for (const child of token.children) {
      if (child.type === 'text') {
        child.content = child.content.replace(/^\[([ xX])\]\s+/, (_match, checked: string) => checked.trim() ? '☑ ' : '☐ ')
      }
    }
  }
})

export function renderMarkdown(source: string) {
  const rendered = markdown.render(source)
  return DOMPurify.sanitize(rendered, {
    FORBID_TAGS: ['img', 'iframe', 'object', 'embed', 'style'],
    FORBID_ATTR: ['style']
  })
}
