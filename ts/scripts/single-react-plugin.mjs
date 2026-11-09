import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const REACT_IMPORT = /^react(\/.*)?$/

export function singleReactPlugin({ projectRoot }) {
  const projectRequire = createRequire(resolve(projectRoot, 'package.json'))
  return {
    name: 'rngpui single react',
    setup(build) {
      build.onResolve({ filter: REACT_IMPORT }, (args) => {
        try {
          return { path: projectRequire.resolve(args.path) }
        } catch {
          return undefined
        }
      })
    },
  }
}
