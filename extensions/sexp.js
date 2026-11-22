
(function (Scratch) {

    const settings = {
        pairs: { '(': ')' },
        prefix: [],
        postfix: [],
        chain: [],
        attach: [],
        comment: ';',
        whitelist: ".+"
    };

    const jsonSetters = {
        setParens: 'pairs',
        setPrefix: 'prefix',
        setPostfix: 'postfix',
        setChain: 'chain',
        setAttatch: 'attach',
    };

    class ParseError extends Error {
        constructor(message, pos) {
            super(`${message} (line ${pos.line}, column ${pos.col})`);
            this.name = 'ParseError';
            this.pos = pos
        }
    }
    function s_parse(src, options = {}) {
        const { pairs = { '(': ')' }, comment = ';', prefix = [], postfix = [], chain = [], attach = [], whitelist = ".+" } = options;
        const openers = new Set(Object.keys(pairs));
        const closers = new Set(Object.values(pairs));
        const attachSet = new Set(attach);
        const invalidRegex = new RegExp(whitelist, "m");
        const badOp = (op) => typeof op !== 'string' || op === '' || /\s/.test(op) || [...op].some((c) => openers.has(c) || closers.has(c) || c === '"' || c === comment);
        for (const [name, ops] of Object.entries({ prefix, postfix, chain })) {
            for (const op of ops) {
                if (badOp(op)) {
                    throw new Error(`Invalid ${name} operator: ${JSON.stringify(op)}`)
                }
            }
        }
        for (const op of postfix) {
            if (chain.includes(op)) {
                throw new Error(`Operator ${JSON.stringify(op)} is both postfix and chain`)
            }
        }
        for (const o of attach) {
            if (!openers.has(o)) {
                throw new Error(`attach: '${o}' is not an opening bracket`)
            }
        }
        const prefixOps = [...prefix].sort((a, b) => b.length - a.length);
        const suffixOps = [...postfix.map((op) => ({ op, kind: 'postfix' })), ...chain.map((op) => ({ op, kind: 'chain' }))]
            .sort((a, b) => b.op.length - a.op.length);
        let i = 0, line = 1, col = 1;
        const pos = () => ({ offset: i, line, col });
        const eof = () => i >= src.length;
        const next = () => {
            const c = src[i++];
            if (c === '\n') {
                line += 1;
                col = 1
            } else {
                col += 1
            }
            return c
        };
        const advance = (n) => {
            for (let k = 0; k < n; k += 1) {
                next()
            }
        }
        const isSpace = (c) => /\s/.test(c);
        const isDelimiter = (c) => isSpace(c) || openers.has(c) || closers.has(c) || c === '"' || c === comment;
        const endsExpr = (c) => c === undefined || isSpace(c) || closers.has(c) || c === comment;
        const prefixAt = (idx) => prefixOps.find((op) => src.startsWith(op, idx));
        const suffixAt = (idx) => suffixOps.find((s) => src.startsWith(s.op, idx));

        function skipTrivia() {
            while (!eof()) {
                const c = src[i];
                if (isSpace(c)) {
                    next()
                } else if (c === comment) {
                    while (!eof() && src[i] !== '\n') {
                        next()
                    }
                } else {
                    break
                }
            }
        }

        function readString() {
            const start = pos();
            next();
            let out = '';
            while (true) {
                if (eof()) {
                    throw new ParseError('Unterminated string', start)
                }
                const c = next();
                if (c === '"') {
                    break
                }
                if (c !== '\\') {
                    out += c;
                    continue
                }
                if (eof()) {
                    throw new ParseError('Unterminated string', start)
                }
                const escPos = pos();
                const e = next();
                switch (e) {
                    case 'n':
                        out += '\n';
                        break;
                    case 't':
                        out += '\t';
                        break;
                    case 'r':
                        out += '\r';
                        break;
                    case '0':
                        out += '\0';
                        break;
                    case '"':
                        out += '"';
                        break;
                    case '\\':
                        out += '\\';
                        break;
                    case 'u': {
                        const hex = src.slice(i, i + 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                            throw new ParseError('Invalid \\u escape', escPos)
                        }
                        advance(4);
                        out += String.fromCharCode(parseInt(hex, 16));
                        break
                    }
                    default:
                        throw new ParseError(`Unknown escape \\${e}`, escPos)
                }
            }
            return {
                type: 'string',
                value: out
            }
        }
        const isDecimalPoint = (start, s) => s.op === '.' && /^[+-]?\d+$/.test(src.slice(start, i)) && /\d/.test(src[i + 1] ?? '');

        function readAtom() {
            const start = i;
            const post = pos()
            advance(suffixAt(i)?.op.length ?? 1);
            while (!eof() && !isDelimiter(src[i])) {
                const s = suffixAt(i);
                if (s && !isDecimalPoint(start, s)) {
                    break
                }
                next()
            }
            const value = src.slice(start, i);
            if (!invalidRegex.test(value)) throw new ParseError(`Invalid atom name: "${value}"`, post);
            return {
                type: 'atom',
                value: value
            }
        }

        function readList() {
            const start = pos();
            const open = next();
            const close = pairs[open];
            const items = [];
            while (true) {
                skipTrivia();
                if (eof()) {
                    throw new ParseError(`Unclosed '${open}', expected '${close}'`, start)
                }
                const c = src[i];
                if (closers.has(c)) {
                    if (c !== close) {
                        throw new ParseError(`Mismatched bracket: expected '${close}' but found '${c}'`, pos())
                    }
                    next();
                    return {
                        type: 'list',
                        open,
                        close,
                        items
                    }
                }
                items.push(readExpr())
            }
        }

        function readPrimary() {
            const c = src[i];
            if (openers.has(c)) {
                return readList()
            }
            if (c === '"') {
                return readString()
            }
            return readAtom()
        }
        const addLink = (node, link) => {
            if (node.type === 'chain') {
                node.links.push(link);
                return node
            }
            return {
                type: 'chain',
                head: node,
                links: [link]
            }
        };

        function readWithSuffixes() {
            let node = readPrimary();
            while (!eof()) {
                if (attachSet.has(src[i])) {
                    node = addLink(node, {
                        kind: 'attach',
                        node: readList()
                    });
                    continue
                }
                const s = suffixAt(i);
                if (!s) {
                    break
                }
                const opPos = pos();
                advance(s.op.length);
                if (s.kind === 'postfix') {
                    node = {
                        type: 'postfix',
                        op: s.op,
                        operand: node
                    }
                } else {
                    if (endsExpr(src[i])) {
                        throw new ParseError(`Expected an expression after '${s.op}'`, opPos)
                    }
                    node = addLink(node, {
                        kind: 'infix',
                        op: s.op,
                        node: readPrimary()
                    })
                }
            }
            return node
        }

        function readExpr() {
            const c = src[i];
            if (closers.has(c)) {
                throw new ParseError(`Unexpected '${c}'`, pos())
            }
            const op = prefixAt(i);
            if (op && !endsExpr(src[i + op.length])) {
                advance(op.length);
                return {
                    type: 'prefix',
                    op,
                    operand: readExpr()
                }
            }
            return readWithSuffixes()
        }
        const result = [];
        while (true) {
            skipTrivia();
            if (eof()) {
                break
            }
            result.push(readExpr())
        }
        return result
    }
    function s_toPlain(node) {
        if (Array.isArray(node)) {
            return node.map(s_toPlain)
        }
        switch (node.type) {
            case 'list':
                return node.items.map(s_toPlain);
            case 'prefix':
            case 'postfix':
                return [node.op, s_toPlain(node.operand)];
            case 'chain':
                return node.links.reduce((acc, l) => l.kind === 'attach' ? [l.node.open, acc, ...l.node.items.map(s_toPlain)] : [l.op, acc, s_toPlain(l.node)], s_toPlain(node.head),);
            default:
                return node.value
        }
    }
    function s_print(node) {
        if (Array.isArray(node)) {
            return node.map(s_print).join('\n')
        }
        switch (node.type) {
            case 'string':
                return JSON.stringify(node.value);
            case 'atom':
                return node.value;
            case 'list':
                return node.open + node.items.map(s_print).join(' ') + node.close;
            case 'prefix':
                return node.op + s_print(node.operand);
            case 'postfix':
                return s_print(node.operand) + node.op;
            case 'chain':
                return s_print(node.head) + node.links.map((l) => (l.kind === 'attach' ? s_print(l.node) : l.op + s_print(l.node))).join('')
        }
    }
    function tramp(fn, args = []) {
        try {
            return fn(...args)
        } catch (e) {
            console.error(e);
            return null
        }
    }

    class Extension {
        getInfo() {
            return {
                "id": "dmnsexp",
                "name": "S Expressions",
                "color1": "#b6ab49",
                "color2": "#5d5725",
                "blocks": [
                    {
                        "opcode": "parse",
                        "text": "parse s expression [EXPR]",
                        "blockType": "reporter",
                        "arguments": {
                            "EXPR": {
                                "type": "string",
                                "defaultValue": "(+ 2 3)"
                            }
                        }
                    },
                    {
                        "opcode": "plain",
                        "text": "simplify tree [NODE]",
                        "blockType": "reporter",
                        "arguments": {
                            "NODE": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "opcode": "print",
                        "text": "print tree [NODE]",
                        "blockType": "reporter",
                        "arguments": {
                            "NODE": {
                                "type": "string"
                            }
                        }
                    },
                    "---",
                    {
                        "opcode": "setParens",
                        "text": "set acceptable delimiters to [DELIMS]",
                        "blockType": "command",
                        "arguments": {
                            "DELIMS": {
                                "type": "string",
                                "defaultValue": JSON.stringify(settings.pairs)
                            }
                        }
                    },
                    {
                        "opcode": "setPrefix",
                        "text": "set acceptable prefixes to [DELIMS]",
                        "blockType": "command",
                        "arguments": {
                            "DELIMS": {
                                "type": "string",
                                "defaultValue": JSON.stringify(settings.prefix)
                            }
                        }
                    },
                    {
                        "opcode": "setPostfix",
                        "text": "set acceptable postfixes to [DELIMS]",
                        "blockType": "command",
                        "arguments": {
                            "DELIMS": {
                                "type": "string",
                                "defaultValue": JSON.stringify(settings.postfix)
                            }
                        }
                    },
                    {
                        "opcode": "setChain",
                        "text": "set acceptable chaining operators to [DELIMS]",
                        "blockType": "command",
                        "arguments": {
                            "DELIMS": {
                                "type": "string",
                                "defaultValue": JSON.stringify(settings.chain)
                            }
                        }
                    },
                    {
                        "opcode": "setAttatch",
                        "text": "set acceptable attachments to [DELIMS]",
                        "blockType": "command",
                        "arguments": {
                            "DELIMS": {
                                "type": "string",
                                "defaultValue": JSON.stringify(settings.attach)
                            }
                        }
                    },
                    {
                        "opcode": "setComment",
                        "text": "set acceptable comment prefix to [DELIM]",
                        "blockType": "command",
                        "arguments": {
                            "DELIM": {
                                "type": "string",
                                "defaultValue": settings.comment
                            }
                        }
                    },
                    {
                        "opcode": "setWhitelist",
                        "text": "set atom whitelist to regexp [REGEXP]",
                        "blockType": "command",
                        "arguments": {
                            "REGEXP": {
                                "type": "string",
                                "defaultValue": settings.whitelist
                            }
                        }
                    },
                ]
            }
        }
        parse(args) {
            try {
                return JSON.stringify(s_parse(args.EXPR, settings));
            } catch (e) {
                return e.toString()
            }
        }

        plain(args) {
            try {
                var tree = JSON.parse(args.NODE)
                return JSON.stringify(s_toPlain(tree))
            } catch(e) {
                return ""
            }
        }

        print(args) {
            try {
                return s_print(JSON.parse(args.NODE))
            } catch(e) {
                return ""
            }
        }


    }

    for (const [opcode, key] of Object.entries(jsonSetters)) {
        Extension.prototype[opcode] = function (args) {
            const parsed = tramp(JSON.parse, [args.DELIMS]);
            if ((parsed ?? null) !== null) settings[key] = parsed;
        };
    }

    Extension.prototype.setComment = function (args) {
        settings.comment = String(args.DELIM);
    };

    Extension.prototype.setWhitelist = function (args) {
        settings.whitelist = String(args.REGEXP);
    };

    let extension = new Extension();
    Scratch.extensions.register(extension);
})(Scratch);