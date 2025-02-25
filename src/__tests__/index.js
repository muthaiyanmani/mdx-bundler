import './setup-tests.js'
import path from 'path'
import {test} from 'uvu'
import * as assert from 'uvu/assert'
import React from 'react'
import rtl from '@testing-library/react'
import leftPad from 'left-pad'
import {remarkMdxImages} from 'remark-mdx-images'
import {VFile} from 'vfile'
import {bundleMDX} from '../index.js'
import {getMDXComponent, getMDXExport} from '../client.js'

const {render} = rtl

test('smoke test', async () => {
  const mdxSource = `
---
title: Example Post
published: 2021-02-13
description: This is some meta-data
---

# This is the title

import Demo from './demo'

Here's a **neat** demo:

<Demo />
`.trim()

  const result = await bundleMDX({
    source: mdxSource,
    files: {
      './demo.tsx': `
import * as React from 'react'
import leftPad from 'left-pad'
import SubDir from './sub/dir.tsx'
import data from './data.json'
import jsInfo from './js-info.js'
import JsxComp from './jsx-comp.jsx'
import MdxComp from './mdx-comp.mdx'

function Demo() {
  return (
    <div>
      {leftPad("Neat demo!", 12, '!')}
      <SubDir>Sub dir!</SubDir>
      <p>JSON: {data.package}</p>
      <div>{jsInfo}</div>
      <JsxComp />
      <MdxComp />
    </div>
  )
}

export default Demo
      `.trim(),
      './sub/dir.tsx': `
import * as React from 'react'

export default ({children}) => <div className="sub-dir">{children}</div>
      `.trim(),
      './js-info.js': 'export default "this is js info"',
      './jsx-comp.jsx': 'export default () => <div>jsx comp</div>',
      './mdx-comp.mdx': `
---
title: This is frontmatter
---

# Frontmatter title: {frontmatter.title}
      `.trim(),
      './data.json': `{"package": "mdx-bundler"}`,
    },
    globals: {'left-pad': 'myLeftPad'},
  })

  const frontmatter =
    /** @type { title: string, description: string, published: string } */ result.frontmatter

  /**
   * This creates a custom left pad which uses a different filler character to the one supplied.
   * If it is not substituted the original will be used and we will get "!" instead of "$"
   *
   * @param {string} string
   * @param {number} length
   * @returns {string}
   */
  const myLeftPad = (string, length) => {
    return leftPad(string, length, '$')
  }

  const Component = getMDXComponent(result.code, {myLeftPad})

  /** @param {React.HTMLAttributes<HTMLSpanElement>} props */
  const SpanBold = props => React.createElement('span', props)

  assert.equal(frontmatter, {
    title: 'Example Post',
    published: new Date('2021-02-13'),
    description: 'This is some meta-data',
  })

  const {container} = render(
    React.createElement(Component, {components: {strong: SpanBold}}),
  )

  assert.equal(
    container.innerHTML,
    `<h1>This is the title</h1>

<p>Here's a <span>neat</span> demo:</p>
<div>$$Neat demo!<div class="sub-dir">Sub dir!</div><p>JSON: mdx-bundler</p><div>this is js info</div><div>jsx comp</div><h1>Frontmatter title: This is frontmatter</h1></div>`,
  )
})

test('bundles 3rd party deps', async () => {
  const mdxSource = `
import Demo from './demo'

<Demo />
  `.trim()

  const result = await bundleMDX({
    source: mdxSource,
    files: {
      './demo.tsx': `
import leftPad from 'left-pad'

export default () => leftPad("Neat demo!", 12, '!')
    `.trim(),
    },
  })

  // this test ensures that *not* passing leftPad as a global here
  // will work because I didn't externalize the left-pad module
  const Component = getMDXComponent(result.code)
  render(React.createElement(Component))
})

test('gives a handy error when the entry imports a module that cannot be found', async () => {
  const mdxSource = `
import Demo from './demo'

<Demo />
  `.trim()

  const error = /** @type Error */ (
    await bundleMDX({
      source: mdxSource,
      files: {},
    }).catch(e => e)
  )

  assert.match(error.message, `ERROR: Could not resolve "./demo"`)
})

test('gives a handy error when importing a module that cannot be found', async () => {
  const mdxSource = `
import Demo from './demo'

<Demo />
  `.trim()

  const error = /** @type Error */ (
    await bundleMDX({
      source: mdxSource,
      files: {
        './demo.tsx': `import './blah-blah'`,
      },
    }).catch(e => e)
  )

  assert.equal(
    error.message,
    `Build failed with 1 error:
demo.tsx:1:7: ERROR: Could not resolve "./blah-blah"`,
  )
})

test('gives a handy error when a file of an unsupported type is provided', async () => {
  const mdxSource = `
import Demo from './demo.blah'

<Demo />
  `.trim()

  const error = /** @type Error */ (
    await bundleMDX({
      source: mdxSource,
      files: {
        './demo.blah': `what even is this?`,
      },
    }).catch(e => e)
  )

  assert.match(
    error.message,
    `ERROR: [plugin: inMemory] Invalid loader value: "blah"`,
  )
})

test('files is optional', async () => {
  await bundleMDX({source: 'hello'})
})

test('uses the typescript loader where needed', async () => {
  const mdxSource = `
import Demo from './demo'

<Demo />
  `.trim()

  const {code} = await bundleMDX({
    source: mdxSource,
    files: {
      './demo.tsx': `
import * as React from 'react'
import {left} from './left'

const Demo: React.FC = () => {
return <p>{left("TypeScript")}</p>
}

export default Demo
      `.trim(),
      './left.ts': `
import leftPad from 'left-pad'

export const left = (s: string): string => {
return leftPad(s, 12, '!')
}
      `.trim(),
    },
  })

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))
  assert.match(container.innerHTML, '!!TypeScript')
})

test('can specify "node_modules" in the files', async () => {
  const mdxSource = `
import LeftPad from 'left-pad-js'

<LeftPad padding={4} string="^">Hi</LeftPad>
  `.trim()

  const {code} = await bundleMDX({
    source: mdxSource,
    files: {
      'left-pad-js': `export default () => <div>this is left pad</div>`,
    },
  })

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))

  assert.match(container.innerHTML, 'this is left pad')
})

test('should respect the configured loader for files', async () => {
  const mdxSource = `
# Title

import {Demo} from './demo'

<Demo />
  `.trim()

  const files = {
    './demo.ts': `
import React from 'react'

export const Demo: React.FC = () => {
  return <p>Sample</p>
}
    `.trim(),
  }

  const {code} = await bundleMDX({
    source: mdxSource,
    files,
    esbuildOptions: options => {
      options.loader = {
        ...options.loader,
        '.ts': 'tsx',
      }

      return options
    },
  })

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))

  assert.match(container.innerHTML, 'Sample')
})

test('require from current directory', async () => {
  const mdxSource = `
# Title

import {Sample} from './sample-component'

<Sample />

![A Sample Image](./150.png)
`.trim()

  const {code} = await bundleMDX({
    source: mdxSource,
    cwd: path.join(process.cwd(), 'other'),
    mdxOptions: options => {
      options.remarkPlugins = [remarkMdxImages]

      return options
    },
    esbuildOptions: options => {
      options.loader = {
        ...options.loader,
        '.png': 'dataurl',
      }

      return options
    },
  })

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))

  assert.match(container.innerHTML, 'Sample!')
  // Test that the React components image is imported correctly.
  assert.match(container.innerHTML, 'img src="data:image/png')
  // Test that the markdowns image is imported correctly.
  assert.match(
    container.innerHTML,
    'img alt="A Sample Image" src="data:image/png',
  )
})

test('should output assets', async () => {
  const mdxSource = `
# Sample Post

![Sample Image](./150.png)
  `.trim()

  const {code} = await bundleMDX({
    source: mdxSource,
    cwd: path.join(process.cwd(), 'other'),
    bundleDirectory: path.join(process.cwd(), 'output'),
    bundlePath: '/img/',
    mdxOptions: options => {
      options.remarkPlugins = [remarkMdxImages]

      return options
    },
    esbuildOptions: options => {
      options.loader = {
        ...options.loader,
        '.png': 'file',
      }

      return options
    },
  })

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))

  assert.match(container.innerHTML, 'src="/img/150')

  const writeError = /** @type Error */ (
    await bundleMDX({
      source: mdxSource,
      cwd: path.join(process.cwd(), 'other'),
      mdxOptions: options => {
        options.remarkPlugins = [remarkMdxImages]

        return options
      },
      esbuildOptions: options => {
        options.loader = {
          ...options.loader,
          // esbuild will throw its own error if we try to use `file` loader without `outdir`
          '.png': 'dataurl',
        }
        options.write = true

        return options
      },
    }).catch(e => e)
  )

  assert.equal(
    writeError.message,
    "You must either specify `write: false` or `write: true` and `outdir: '/path'` in your esbuild options",
  )

  const optionError = /** @type Error */ (
    await bundleMDX({
      source: mdxSource,
      cwd: path.join(process.cwd(), 'other'),
      bundleDirectory: path.join(process.cwd(), 'output'),
    }).catch(e => e)
  )

  assert.equal(
    optionError.message,
    'When using `bundleDirectory` or `bundlePath` the other must be set.',
  )
})

test('should support importing named exports', async () => {
  const mdxSource = `
---
title: Example Post
published: 2021-02-13
description: This is some meta-data
---

export const uncle = 'Bob'

# {uncle} was indeed the uncle
`.trim()

  const result = await bundleMDX({source: mdxSource})

  /** @type {import('../types').MDXExport<{uncle: string}, {title: string, published: Date, description: string}>} */
  const mdxExport = getMDXExport(result.code)

  // remark-mdx-frontmatter exports frontmatter
  assert.equal(mdxExport.frontmatter, {
    title: 'Example Post',
    published: new Date('2021-02-13'),
    description: 'This is some meta-data',
  })

  assert.equal(mdxExport.uncle, 'Bob')

  const {container} = render(React.createElement(mdxExport.default))

  assert.equal(container.innerHTML, `<h1>Bob was indeed the uncle</h1>`)
})

test('should support mdx from node_modules', async () => {
  const mdxSource = `
import MdxData from 'mdx-test-data'

Local Content

<MdxData />
  `.trim()

  const {code} = await bundleMDX({source: mdxSource})

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))

  assert.match(
    container.innerHTML,
    'Mdx file published as an npm package, for testing purposes.',
  )
})

test('should support mdx from VFile', async () => {
  const mdxSource = `# Heading`

  const vfile = new VFile({value: mdxSource, path: '/data/mdx/my-post.mdx'})

  const {code} = await bundleMDX({source: vfile})

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))

  assert.is(container.innerHTML, '<h1>Heading</h1>')
})

test('should support mdx from VFile without path', async () => {
  const mdxSource = `# Heading`

  const vfile = new VFile({value: mdxSource})

  const {code} = await bundleMDX({source: vfile})

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))

  assert.is(container.innerHTML, '<h1>Heading</h1>')
})

test('should provide VFile path to plugins', async () => {
  const mdxSource = `# Heading`

  const vfile = new VFile({value: mdxSource, path: '/data/mdx/my-post.mdx'})

  /** @type {import('unified').Plugin} */
  function plugin() {
    return function transformer(tree, file) {
      assert.is(file.path, '/data/mdx/my-post.mdx' )
    }
  }

  const {code} = await bundleMDX({
    source: vfile,
    mdxOptions(options) {
      options.remarkPlugins = [plugin]
      return options
    },
  })

  const Component = getMDXComponent(code)

  const {container} = render(React.createElement(Component))

  assert.is(container.innerHTML, '<h1>Heading</h1>')
})

test('should work with react-dom api', async () => {
  const mdxSource = `
import Demo from './demo'

<Demo />
  `.trim()

  const result = await bundleMDX({
    source: mdxSource,
    files: {
      './demo.tsx': `
import * as ReactDOM from 'react-dom'

function Demo() {
  return ReactDOM.createPortal(
    <div>Portal!</div>,
    document.body
  )
}

export default Demo
`.trim(),
    },
  })

  const Component = getMDXComponent(result.code)

  const {container} = render(React.createElement(Component), {
    container: document.body,
  })

  assert.match(container.innerHTML, 'Portal!')
})

test('should allow gray matter options to be accessed', async () => {
  const mdxSource = `
---
title: Sample
date: 2021-07-27
---

Some excerpt

---

This is the rest of the content

  `.trim()

  const {matter} = await bundleMDX({
    source: mdxSource,
    grayMatterOptions: options => {
      options.excerpt = true

      return options
    },
  })

  assert.equal((matter.excerpt ? matter.excerpt : '').trim(), 'Some excerpt')
})

test('specify a file using bundleMDX', async () => {
  const {frontmatter} = await bundleMDX({
    file: path.join(process.cwd(), 'other', 'sample.mdx'),
    cwd: path.join(process.cwd(), 'other'),
    esbuildOptions: options => {
      options.loader = {
        ...options.loader,
        '.png': 'dataurl',
      }

      return options
    },
  })

  assert.equal(frontmatter.title, 'Sample')
})

test('let you use the front matter in config', async () => {
  await bundleMDX({
    file: path.join(process.cwd(), 'other', 'sample.mdx'),
    cwd: path.join(process.cwd(), 'other'),
    esbuildOptions: (options, frontmatter) => {
      assert.equal(frontmatter.title, 'Sample')

      options.loader = {
        ...options.loader,
        '.png': 'dataurl',
      }

      return options
    },
  })
})

test.run()
