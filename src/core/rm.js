'use strict'

const promisify = require('promisify-es6')
const UnixFs = require('ipfs-unixfs')
const waterfall = require('async/waterfall')
const {
  DAGNode
} = require('ipld-dag-pb')
const CID = require('cids')
const {
  traverseTo,
  updateTree,
  updateMfsRoot,
  FILE_SEPARATOR
} = require('./utils')

const defaultOptions = {
  recursive: false
}

module.exports = function mfsRm (ipfs) {
  return promisify(function (path, options, callback) {
    if (typeof path === 'function') {
      return path(new Error('Please specify a path to remove'))
    }

    if (!callback) {
      callback = options
      options = {}
    }

    options = Object.assign({}, defaultOptions, options)

    path = path.trim()

    if (path === FILE_SEPARATOR) {
      return callback(new Error('Cannot delete root'))
    }

    waterfall([
      (cb) => traverseTo(ipfs, path, {
        withCreateHint: false
      }, cb),
      (result, cb) => {
        const meta = UnixFs.unmarshal(result.node.data)

        if (meta.type === 'directory' && !options.recursive) {
          return cb(new Error(`${path} is a directory, use -r to remove directories`))
        }

        waterfall([
          (next) => DAGNode.rmLink(result.parent.node, result.name, next),
          (newParentNode, next) => {
            ipfs.dag.put(newParentNode, {
              cid: new CID(newParentNode.hash || newParentNode.multihash)
            }, (error) => next(error, newParentNode))
          },
          (newParentNode, next) => {
            result.parent.node = newParentNode

            updateTree(ipfs, result.parent, next)
          },
          (newRoot, next) => updateMfsRoot(ipfs, newRoot.node.multihash, next)
        ], cb)
      }
    ], callback)
  })
}
