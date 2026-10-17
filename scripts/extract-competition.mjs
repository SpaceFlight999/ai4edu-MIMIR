import { writeFileSync } from 'node:fs'
import { openArchive } from './archive.mjs'
const file = process.argv[2] || '西安交通大学《电信T.A杯》“AI+教育”创新应用技能大赛比赛方案.docx'
const archive = openArchive(file)
const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
try {
  const xml = archive.contents('word/document.xml').toString('utf8')
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(([paragraph]) => [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(([, value]) => decode(value)).join('')).filter(Boolean)
  const links = archive.entries.has('word/_rels/document.xml.rels') ? [...archive.contents('word/_rels/document.xml.rels').toString('utf8').matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*>/g)].map(([, value]) => decode(value)).filter(value => /^https?:/.test(value)) : []
  const text = paragraphs.join('\n') + (links.length ? '\n\nDocument links:\n' + links.join('\n') : '')
  writeFileSync('artifacts/competition-text.txt', text)
  console.log(text)
} finally { archive.close() }
