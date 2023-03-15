import htmlparser = require('htmlparser')
import camelcase = require('camelcase')
import unescape = require('unescape')
import { INewsFieldAttributes, INewsFieldName, INewsStory } from './types/inews'
import { NodeCallback } from './types/util'

export default (nsml: string, callback: NodeCallback<INewsStory>): void => {
	const parseHandler = new htmlparser.DefaultHandler((error, dom) => {
		if (error) callback(error, null)
		else callback(null, parseNsml(dom))
	})

	const parser = new htmlparser.Parser(parseHandler)
	parser.parseComplete(nsml)

	function parseNsml(nodes: htmlparser.DOM, inputStory?: Partial<INewsStory>): INewsStory {
		const story: Partial<INewsStory> = inputStory ?? {
			fields: {
				// gets populated as the parsing continues
				title: { value: undefined },
				modifyDate: { value: undefined },
				tapeTime: { value: undefined },
				audioTime: { value: undefined },
				totalTime: { value: undefined },
				cumeTime: { value: undefined },
				backTime: { value: undefined },
				pageNumber: { value: undefined },
				layout: { value: undefined },
				runsTime: { value: undefined },
			},
			meta: {},
			cues: [],
		}

		nodes.forEach(function (node) {
			parseNsmlNode(node, story)
		})

		return story as INewsStory
	}

	function stringifyNodes(nodes: htmlparser.DOM): string {
		let nodeStr = ''
		if (Array.isArray(nodes)) {
			nodes.forEach((node) => {
				nodeStr += stringifyNode(node)
			})
		}
		return nodeStr
	}

	function stringifyNode(node: htmlparser.Node): string {
		let nodeStr = ''
		if (node.type === 'text') return node.data
		else if (node.type === 'tag') {
			nodeStr = '<' + node.name
			const attrStr = stringifyAttributes(node.attribs)
			if (attrStr.length > 0) nodeStr += ' ' + attrStr
			nodeStr += '>'
			nodeStr += stringifyNodes(node.children)
			nodeStr += '</' + node.name + '>'
		}

		return nodeStr
	}

	function stringifyAttributes(attributes: htmlparser.NodeAttributes): string {
		let attrStr = ''
		for (const key in attributes) {
			if (attrStr.length > 0) attrStr += ' '
			attrStr += key + '="' + attributes[key].replace(/"/g, '\\"') + '"'
		}
		return attrStr
	}

	function nodesToArray(nodes: htmlparser.DOM, tag: string) {
		let lines: string[] = []

		nodes.forEach((node) => {
			if (node.type === 'tag') {
				if (!node.children) {
					return
				}
				if (node.name === tag) {
					lines.push(unescape(stringifyNodes(node.children)))
				}
				lines = lines.concat(nodesToArray(node.children, tag))
			}
		})

		// Filter out leading lines in production cues
		lines = lines.filter((line) => {
			return (line as any) > 0 || line != ']] S3.0 G 0 [['
		})

		return lines
	}

	function parseNsmlNode(node: htmlparser.Node, story: Partial<INewsStory>) {
		if (node.type === 'tag') {
			switch (node.name) {
				case 'ae':
					try {
						const id = parseInt(node.attribs['id'], 10)
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						story.cues![id] = nodesToArray(node.children, 'ap')
					} catch (error) {
						// Do nothing.
					}
					break
				case 'body':
					story.body = unescape(stringifyNodes(node.children))
					break
				case 'meta':
					story.meta = node.attribs
					break
				case 'storyid':
					try {
						story.id = node.children[0]['data']
					} catch (error) {
						// Do nothing.
					}
					break
				case 'f':
					try {
						const key = node.attribs['id']
						const val = node.children[0]['data']
						const uec = Boolean(node.attribs['uec'])
						const urgency = (
							'urgency' in node.attribs ? parseInt(node.attribs['urgency'], 10) : undefined
						) as INewsFieldAttributes['urgency']
						const aready = node.attribs['aready']
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						story.fields![camelcase(key) as INewsFieldName] = {
							value: unescape(val),
							attributes: {
								uec,
								urgency,
								aready,
							},
						}
					} catch (error) {
						// Do nothing.
					}
					break
				default:
					if (Array.isArray(node.children)) parseNsml(node.children, story)

					break
			}
		}
	}
}
