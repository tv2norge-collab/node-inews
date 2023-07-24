"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const htmlparser = require("htmlparser");
const camelcase = require("camelcase");
const unescape = require("unescape");
exports.default = async (nsml) => {
    return new Promise((resolve, reject) => {
        const parseHandler = new htmlparser.DefaultHandler((error, dom) => {
            if (error) {
                reject(error);
            }
            else {
                try {
                    resolve(parseNsml(dom));
                }
                catch (error) {
                    reject(error);
                }
            }
        });
        const parser = new htmlparser.Parser(parseHandler);
        // In order to properly parse multi-part XML attachments, we have to manually
        // strip their CDATA tags here.
        parser.parseComplete(nsml.replace(/<!\[CDATA\[|]]>/g, ''));
    });
};
function parseNsml(nodes, inputStory) {
    const story = inputStory ?? {
        fields: {
            // gets populated as the parsing continues
            title: undefined,
            modifyDate: undefined,
            tapeTime: undefined,
            audioTime: undefined,
            totalTime: undefined,
            cumeTime: undefined,
            backTime: undefined,
            pageNumber: undefined,
            layout: undefined,
            runsTime: undefined,
            videoId: undefined,
        },
        meta: {},
        cues: [],
        attachments: {},
    };
    nodes.forEach(function (node) {
        parseNsmlNode(node, story);
    });
    return story;
}
function stringifyNodes(nodes) {
    let nodeStr = '';
    if (Array.isArray(nodes)) {
        nodes.forEach((node) => {
            nodeStr += stringifyNode(node);
        });
    }
    return nodeStr;
}
function stringifyNode(node) {
    let nodeStr = '';
    if (node.type === 'text')
        return node.data;
    else if (node.type === 'tag') {
        nodeStr = '<' + node.name;
        const attrStr = stringifyAttributes(node.attribs);
        if (attrStr.length > 0)
            nodeStr += ' ' + attrStr;
        nodeStr += '>';
        nodeStr += stringifyNodes(node.children);
        nodeStr += '</' + node.name + '>';
    }
    return nodeStr;
}
function stringifyAttributes(attributes) {
    let attrStr = '';
    for (const key in attributes) {
        if (attrStr.length > 0)
            attrStr += ' ';
        attrStr += key + '="' + attributes[key].replace(/"/g, '\\"') + '"';
    }
    return attrStr;
}
function nodesToArray(nodes, tag) {
    let lines = [];
    nodes.forEach((node) => {
        if (node.type === 'tag') {
            if (!node.children) {
                return;
            }
            if (node.name === tag) {
                lines.push(unescape(stringifyNodes(node.children)));
            }
            lines = lines.concat(nodesToArray(node.children, tag));
        }
    });
    // Filter out leading lines in production cues
    lines = lines.filter((line) => {
        return line != ']] S3.0 G 0 [[';
    });
    return lines;
}
function parseNsmlNode(node, story) {
    if (node.type === 'tag') {
        switch (node.name) {
            case 'ae':
                try {
                    const id = parseInt(node.attribs['id'], 10);
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    story.cues[id] = nodesToArray(node.children, 'ap');
                }
                catch (error) {
                    // Do nothing.
                }
                break;
            case 'body':
                story.body = unescape(stringifyNodes(node.children));
                break;
            case 'meta':
                story.meta = node.attribs;
                break;
            case 'storyid':
                try {
                    story.id = node.children[0]['data'];
                }
                catch (error) {
                    // Do nothing.
                }
                break;
            case 'f':
                try {
                    const key = node.attribs['id'];
                    const val = node.children[0]['data'];
                    const uec = Boolean(node.attribs['uec']);
                    const urgency = sanitizeUrgency(node.attribs['urgency']);
                    const aready = node.attribs['aready'];
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    story.fields[camelcase(key)] = {
                        value: unescape(val),
                        attributes: {
                            uec,
                            urgency,
                            aready,
                        },
                    };
                }
                catch (error) {
                    // Do nothing.
                }
                break;
            case 'attachment': {
                if (!story.attachments) {
                    story.attachments = {};
                }
                story.attachments[node.attribs['id']] = unescape(stringifyNodes(node.children)).trim();
                break;
            }
            default:
                if (Array.isArray(node.children))
                    parseNsml(node.children, story);
                break;
        }
    }
}
function sanitizeUrgency(unsanitizedUrgency) {
    if (unsanitizedUrgency === undefined) {
        return;
    }
    const urgency = parseInt(unsanitizedUrgency, 10);
    return isValidUrgency(urgency) ? urgency : undefined;
}
function isValidUrgency(urgency) {
    return urgency >= 1 && urgency <= 3;
}
//# sourceMappingURL=inewsStoryParser.js.map