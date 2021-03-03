const fs = require('fs')
const { join } = require('path')
const pMap = require('p-map')
const prettier = require('prettier')

const {
  dependencies = {},
  productName: product_name = 'de arco',
} = require('../package.json')

const SKIPPED_DEPENDENCIES = new Set([])

const root_dir = join(__dirname, '..')
const node_modules_path = join(root_dir, 'node_modules')
const destination_path = join(root_dir, 'ACKNOWLEDGMENTS.md')

const isItALicenseFile = _ => /^licen[s|c]e/i.test(_)

const getMarkdownForDependency = async dependency_name => {
  let license_body

  if (dependency_name === 'fs-xattr') {
    license_body = 'License: MIT'
  } else {
    const dependency_root_path = join(node_modules_path, dependency_name)
    const licenseFileName = (
      await fs.promises.readdir(dependency_root_path)
    ).find(isItALicenseFile)
    if (licenseFileName) {
      const license_file_path = join(dependency_root_path, licenseFileName)
      license_body = (
        await fs.promises.readFile(license_file_path, 'utf8')
      ).trim()
    } else {
      const package_json_path = join(dependency_root_path, 'package.json')
      const { license } = JSON.parse(
        await fs.promises.readFile(package_json_path),
      )
      if (!license) {
        throw new Error(`Could not find license for ${dependency_name}`)
      }
      license_body = `License: ${license}`
    }
  }

  return [
    `## ${dependency_name}`,
    '',
    ...license_body.split(/\r?\n/).map(line => {
      const trimmed = line.trim()
      if (trimmed) {
        return `    ${trimmed}`
      }
      return trimmed
    }),
  ].join('\n')
}

const licenseComment = () => {
  const fileCreatedYear = 2021
  const currentYear = new Date().getFullYear()
  const yearRange =
    fileCreatedYear === currentYear
      ? fileCreatedYear
      : `${fileCreatedYear}-${currentYear}`

  return [
    `<!-- Copyright ${yearRange} de arco -->`,
    '<!-- SPDX-License-Identifier: WTFPL -->',
  ].join('\n')
}

const main = async () => {
  const dependency_names = [...Object.keys(dependencies)]
    .filter(name => !SKIPPED_DEPENDENCIES.has(name))
    .sort()

  const markdownsForDependency = await pMap(
    dependency_names,
    getMarkdownForDependency,
    // Without this, we may run into "too many open files" errors.
    {
      concurrency: 100,
      timeout: 1000 * 60 * 2,
    },
  )

  const unformatted_output = [
    licenseComment(),
    '# Acknowledgments',
    '',
    `${product_name} makes use of the following open source projects.`,
    '',
    markdownsForDependency.join('\n\n'),
  ].join('\n')

  const prettier_config = await prettier.resolveConfig(destination_path)
  const output = prettier.format(unformatted_output, {
    ...prettier_config,
    filepath: destination_path,
  })

  await fs.promises.writeFile(destination_path, output)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
