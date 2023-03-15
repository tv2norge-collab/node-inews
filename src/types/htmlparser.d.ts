declare module 'htmlparser' {
	class DefaultHandler {
		constructor(callback: DefaultHandlerCallback)
	}

	class Parser {
		constructor(parseHandler: DefaultHandler)

		parseComplete(nsml: string): void
	}

	type DefaultHandlerCallback = (error: NodeJS.ErrnoException, dom: htmlparser.DOM) => void

	const htmlparser: {
		DefaultHandler: typeof DefaultHandler
		Parser: typeof Parser
	}

	export = htmlparser
}

declare namespace htmlparser {
	type DOM = Node[]

	type Node = TextNode | ScriptNode | CommentNode | TagNode

	interface BaseNode {
		raw: string
		data: string
		type: NodeType
	}

	interface ComplexNode extends BaseNode {
		name: string
		attribs: NodeAttributes
		children: Node[]
	}

	interface TextNode extends BaseNode {
		type: NodeType.Text
	}

	interface ScriptNode extends ComplexNode {
		type: NodeType.Script
	}

	interface CommentNode extends BaseNode {
		type: NodeType.Comment
	}

	interface TagNode extends ComplexNode {
		type: NodeType.Tag
	}

	interface NodeAttributes {
		[key: string]: string
	}

	enum NodeType {
		Text = 'text',
		Script = 'script',
		Comment = 'comment',
		Tag = 'tag',
	}
}
