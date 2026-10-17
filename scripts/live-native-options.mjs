import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const nativeEntries = Object.freeze(['suggest-paragraph', 'suggest-latex', 'assist-word', 'assist-markdown', 'assist-pdf', 'assist-figure', 'assist-run', 'assist-research', 'paper-guide', 'paper-question', 'research-synthesis-writing', 'research-chat'])

export function artifactJsonPath(root, value, { existing = false } = {}) {
  if (typeof value !== 'string' || !value || !/\.json$/i.test(value)) throw new TypeError('The report must be a new JSON file within artifacts.')
  const directory = resolve(root, 'artifacts'), file = resolve(root, value), within = relative(directory, file)
  if (!within || within === '..' || within.startsWith('..' + sep) || isAbsolute(within) || basename(file) === '.json') throw new TypeError('Report paths must remain inside artifacts.')
  let parent = dirname(file)
  while (!existsSync(parent)) parent = dirname(parent)
  const actual = relative(realpathSync(root), realpathSync(parent))
  if (actual === '..' || actual.startsWith('..' + sep) || isAbsolute(actual)) throw new TypeError('Report parents must remain inside the workspace.')
  const actualArtifacts = existsSync(directory) ? realpathSync(directory) : directory
  const artifactParent = relative(actualArtifacts, realpathSync(parent))
  if (existsSync(directory) && (artifactParent === '..' || artifactParent.startsWith('..' + sep) || isAbsolute(artifactParent))) throw new TypeError('Report parents must remain inside artifacts.')
  if (existing ? !existsSync(file) : existsSync(file)) throw new TypeError(existing ? 'The resume report does not exist.' : 'The report already exists; select a fresh report path.')
  if (existing) {
    const actualFile = relative(actualArtifacts, realpathSync(file))
    if (actualFile === '..' || actualFile.startsWith('..' + sep) || isAbsolute(actualFile)) throw new TypeError('Resume reports must remain inside artifacts.')
  }
  return file
}

export function nativeRunOptions(args, root, runId) {
  const option = name => {
    const values = args.filter(arg => arg.startsWith(name + '='))
    if (values.length > 1) throw new TypeError('Duplicate option: ' + name)
    return values[0]?.slice(name.length + 1)
  }
  const entriesValue = option('--entries'), resumeValue = option('--resume'), remaining = args.includes('--remaining'), chatOnly = args.includes('--chat-only')
  if (remaining && resumeValue) throw new TypeError('Choose --resume or --remaining, not both.')
  if (entriesValue !== undefined && (remaining || resumeValue || chatOnly)) throw new TypeError('--entries starts an independent run and cannot be combined with resume options.')
  if (chatOnly && !remaining && !resumeValue) throw new TypeError('--chat-only requires a resume report.')
  const selectedEntries = entriesValue === undefined ? [...nativeEntries] : entriesValue.split(',')
  if (!selectedEntries.length || selectedEntries.some(name => !nativeEntries.includes(name)) || new Set(selectedEntries).size !== selectedEntries.length) throw new TypeError('Select unique, supported native entry names.')
  if (!remaining && !resumeValue && selectedEntries.includes('research-synthesis-writing') && !selectedEntries.includes('paper-guide')) throw new TypeError('A fresh synthesis run requires paper-guide in --entries; no hidden prerequisite model calls are permitted.')
  const reportPath = artifactJsonPath(root, option('--report') ?? 'artifacts/live-native-' + runId + '.json')
  const resumePath = remaining || resumeValue ? artifactJsonPath(root, resumeValue ?? 'artifacts/live-native-20261010.json', { existing: true }) : null
  return { selectedEntries, requiredEntries: resumePath ? [...nativeEntries] : selectedEntries, reportPath, resumePath, chatOnly, remaining: Boolean(resumePath), explicitEntries: entriesValue !== undefined }
}
