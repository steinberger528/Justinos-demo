// Runs after `next build`.
//
// The client router prefetches each route segment from a flat file such as
//   /crm/executive/__next.crm.executive.__PAGE__.txt
// Next builds that name by replacing "/" with "." in the segment path. On Windows the
// path it starts from uses "\", so the replace misses and the export writes nested
// folders instead:
//   /crm/executive/__next.crm/executive/__PAGE__.txt
// Every prefetch then 404s. This script moves those files to the names the client asks
// for. On Linux and macOS the export is already correct and this finds nothing to do.

import { readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'out')

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Every file under `dir`, as a list of path parts relative to it. */
async function filesUnder(dir, prefix = []) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await filesUnder(join(dir, entry.name), [...prefix, entry.name]))
    else found.push([...prefix, entry.name])
  }
  return found
}

async function fixDirectory(dir) {
  let moved = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = join(dir, entry.name)
    if (!entry.name.startsWith('__next.')) {
      moved += await fixDirectory(full)
      continue
    }
    // A folder named "__next.<segment>" only exists when the separator bug happened.
    for (const parts of await filesUnder(full)) {
      await rename(join(full, ...parts), join(dir, [entry.name, ...parts].join('.')))
      moved += 1
    }
    await rm(full, { recursive: true, force: true })
  }
  return moved
}

if (await exists(OUT)) {
  const moved = await fixDirectory(OUT)
  if (moved > 0) console.log(`fix-export: flattened ${moved} segment file(s)`)
} else {
  console.error('fix-export: no ./out directory. Run `next build` first.')
  process.exitCode = 1
}
