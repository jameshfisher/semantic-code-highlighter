import crc8 from "crc/crc8";
import * as fs from "fs";
import * as path from "path";
import * as tmGrammars from "tm-grammars";
import * as vscodeOniguruma from "vscode-oniguruma";
import * as vscodeTextmate from "vscode-textmate";

function flagToGrammarInfo(flag: string) {
  return tmGrammars.grammars.find(
    (grammarInfo) =>
      flag === grammarInfo.name || grammarInfo.aliases?.includes(flag)
  );
}

function scopeNameToGrammarFilePath(scopeName: string) {
  for (const grammarInfo of tmGrammars.grammars) {
    if (scopeName === grammarInfo.scopeName) {
      return `./node_modules/tm-grammars/grammars/${grammarInfo.name}.json`;
    }
  }
}

async function loadOnigLib(): vscodeTextmate.RegistryOptions["onigLib"] {
  const blob = await fs.openAsBlob(
    path.join(__dirname, "./node_modules/vscode-oniguruma/release/onig.wasm")
  );
  const wasmBin = await blob.arrayBuffer();
  await vscodeOniguruma.loadWASM({ data: wasmBin });

  return {
    createOnigScanner(patterns) {
      return new vscodeOniguruma.OnigScanner(patterns);
    },
    createOnigString(s) {
      return new vscodeOniguruma.OnigString(s);
    },
  };
}

const registryOptions: vscodeTextmate.RegistryOptions = {
  onigLib: loadOnigLib(),
  loadGrammar: async (scopeName: string) => {
    const grammarPath = scopeNameToGrammarFilePath(scopeName);
    if (!grammarPath) return undefined;
    return vscodeTextmate.parseRawGrammar(
      fs.readFileSync(grammarPath).toString(),
      grammarPath
    );
  },
};

const registry = new vscodeTextmate.Registry(registryOptions);

type Token = { text: string; scopes: string[] };

function* tokenize(
  code: string,
  grammar: vscodeTextmate.IGrammar
): Generator<Token[]> {
  const codeLines = code.split("\n");

  let ruleStack = vscodeTextmate.INITIAL;
  for (let i = 0; i < codeLines.length; i++) {
    const codeLine = codeLines[i];
    const tokenizeLineResult = grammar.tokenizeLine(codeLine, ruleStack);
    const codeLineTokens: Token[] = [];
    for (const token of tokenizeLineResult.tokens) {
      const tokenText = codeLine.substring(token.startIndex, token.endIndex);
      const outToken: Token = { text: tokenText, scopes: token.scopes };
      codeLineTokens.push(outToken);
    }
    yield codeLineTokens;
    ruleStack = tokenizeLineResult.ruleStack;
  }
}

const htmlColors = [
  "#d78797",
  "#c47d85",
  "#b27373",
  "#d38b83",
  "#bf8172",
  "#ac7762",
  "#ca9170",
  "#b78761",
  "#a37c53",
  "#bf975f",
  "#ab8d53",
  "#978248",
  "#af9d55",
  "#9c924c",
  "#898744",
  "#9da353",
  "#8a974e",
  "#788b48",
  "#88a85c",
  "#759c58",
  "#638f54",
  "#6fac6b",
  "#5d9f67",
  "#4c9263",
  "#52af7d",
  "#41a179",
  "#319373",
  "#31b191",
  "#21a28a",
  "#129484",
  "#09b1a4",
  "#00a29c",
  "#039393",
  "#13afb5",
  "#1e9fab",
  "#2690a0",
  "#3cabc3",
  "#439bb7",
  "#468caa",
  "#61a5ce",
  "#6395c0",
  "#6386b1",
  "#829ed4",
  "#808fc4",
  "#7c80b3",
  "#9e96d5",
  "#9887c3",
  "#9179b1",
  "#b58fd1",
  "#ac81be",
  "#a174ab",
  "#c689c8",
  "#ba7cb4",
  "#ad70a1",
  "#d185bb",
  "#c27aa7",
  "#b36e93",
  "#d685aa",
  "#c67a96",
  "#b57084",
];

function styleAttributeForToken(token: Token): string {
  if (
    token.scopes.findIndex(
      (scope) => scope.startsWith("entity.name") || scope.startsWith("variable")
    ) !== -1
  ) {
    const hash = crc8(token.text);
    console.log(hash);
    const colorIndex = hash % htmlColors.length;
    const color = htmlColors[colorIndex];
    return `style="color: ${color}"`;
  }
  return "";
}

function tokenizedFileToHTML(lines: Generator<Token[]>) {
  let html = `<pre><code>`;
  for (const line of lines) {
    for (const token of line) {
      html += `<span ${styleAttributeForToken(
        token
      )} title="${token.scopes.join(",")}">${token.text}</span>`;
    }
    html += `<br>`;
  }
  html += `</code></pre>`;
  return html;
}

async function highlight(code: string, flag: string) {
  const grammarInfo = flagToGrammarInfo(flag);
  if (!grammarInfo) {
    throw new Error(`Failed to find grammar for flag ${flag}`);
  }
  const grammar = await registry.loadGrammar(grammarInfo.scopeName);
  if (!grammar) {
    throw new Error(
      `Failed to load grammar for scope name ${grammarInfo.scopeName}`
    );
  }
  return tokenizedFileToHTML(tokenize(code, grammar));
}

const exampleTypescript = `
function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length,
    temporaryValue: T,
    randomIndex: number;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}
`;

const exampleHaskell = `
-- | The 'foldl' function folds the list from the left,
-- and is tail-recursive.
foldl            :: (a -> b -> a) -> a -> [b] -> a
foldl f z []     =  z
foldl f z (x:xs) =  foldl f (f z x) xs
`;

fs.writeFileSync(
  "typescript.html",
  `<!DOCTYPE html><html><body>${await highlight(
    exampleTypescript,
    "ts"
  )}</body></html>`
);

fs.writeFileSync(
  "haskell.html",
  `<!DOCTYPE html><html><body>${await highlight(
    exampleHaskell,
    "hs"
  )}</body></html>`
);
