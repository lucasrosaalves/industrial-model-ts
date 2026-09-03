/** Binary arithmetic operators supported by the formula grammar. */
export type BinaryOp = "add" | "sub" | "mul" | "div" | "pow" | "mod";

/** Unary arithmetic operators supported by the formula grammar. */
export type UnaryOp = "pos" | "neg";

/** Comparison operators supported by the formula grammar. */
export type CompareOp = "eq" | "ne" | "lt" | "le" | "gt" | "ge";

/** Boolean operators supported by the formula grammar. */
export type BoolOpKind = "and" | "or";

export type NameNode = { readonly kind: "name"; readonly id: string };
export type ConstantNode = { readonly kind: "constant"; readonly value: number };
export type BinOpNode = {
  readonly kind: "binop";
  readonly op: BinaryOp;
  readonly left: ExprNode;
  readonly right: ExprNode;
};
export type UnaryOpNode = {
  readonly kind: "unaryop";
  readonly op: UnaryOp;
  readonly operand: ExprNode;
};
export type CompareNode = {
  readonly kind: "compare";
  readonly left: ExprNode;
  readonly ops: readonly CompareOp[];
  readonly comparators: readonly ExprNode[];
};
export type BoolOpNode = {
  readonly kind: "boolop";
  readonly op: BoolOpKind;
  readonly values: readonly ExprNode[];
};
export type IfExpNode = {
  readonly kind: "ifexp";
  readonly test: ExprNode;
  readonly body: ExprNode;
  readonly orelse: ExprNode;
};
export type CallNode = {
  readonly kind: "call";
  readonly name: string;
  readonly args: readonly ExprNode[];
};

/** Any node of a compiled formula expression tree. */
export type ExprNode =
  | NameNode
  | ConstantNode
  | BinOpNode
  | UnaryOpNode
  | CompareNode
  | BoolOpNode
  | IfExpNode
  | CallNode;

/** Nodes that make an expression require element-by-element evaluation. */
export type ConditionalNode = CompareNode | BoolOpNode | IfExpNode;

export function isConditionalNode(node: ExprNode): node is ConditionalNode {
  return node.kind === "compare" || node.kind === "boolop" || node.kind === "ifexp";
}

/** Walk an expression tree in pre-order. */
export function walkExpr(node: ExprNode, visit: (node: ExprNode) => void): void {
  visit(node);
  switch (node.kind) {
    case "binop":
      walkExpr(node.left, visit);
      walkExpr(node.right, visit);
      break;
    case "unaryop":
      walkExpr(node.operand, visit);
      break;
    case "compare":
      walkExpr(node.left, visit);
      for (const comparator of node.comparators) {
        walkExpr(comparator, visit);
      }
      break;
    case "boolop":
      for (const value of node.values) {
        walkExpr(value, visit);
      }
      break;
    case "ifexp":
      walkExpr(node.test, visit);
      walkExpr(node.body, visit);
      walkExpr(node.orelse, visit);
      break;
    case "call":
      for (const arg of node.args) {
        walkExpr(arg, visit);
      }
      break;
    default:
      break;
  }
}

/** Whether any compare / boolean / ``if`` node is present (including under calls). */
export function treeHasConditional(tree: ExprNode): boolean {
  let found = false;
  walkExpr(tree, (node) => {
    if (isConditionalNode(node)) {
      found = true;
    }
  });
  return found;
}
