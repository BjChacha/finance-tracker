import { appendCalcKey, applyCalcInput, evalMoneyExpr, hasPendingOp } from '../calc';

describe('evalMoneyExpr', () => {
  it('单个数字直接解析为分', () => {
    expect(evalMoneyExpr('12.5')).toBe(1250);
    expect(evalMoneyExpr('0.01')).toBe(1);
    expect(evalMoneyExpr('100')).toBe(10000);
  });

  it('加减法整数分精确计算', () => {
    expect(evalMoneyExpr('10+5')).toBe(1500);
    expect(evalMoneyExpr('10-5.5')).toBe(450);
    expect(evalMoneyExpr('0.1+0.2')).toBe(30);
    expect(evalMoneyExpr('1+2+3')).toBe(600);
  });

  it('乘除法四舍五入到分', () => {
    expect(evalMoneyExpr('12.5×3')).toBe(3750);
    expect(evalMoneyExpr('10÷3')).toBe(333);
    expect(evalMoneyExpr('10÷4')).toBe(250);
    expect(evalMoneyExpr('0.05×0.5')).toBe(3); // 0.025 → 0.03
  });

  it('乘除优先于加减', () => {
    expect(evalMoneyExpr('10+5×2')).toBe(2000);
    expect(evalMoneyExpr('10-4÷2')).toBe(800);
    expect(evalMoneyExpr('2×3+4×5')).toBe(2600);
  });

  it('尾悬运算符被忽略', () => {
    expect(evalMoneyExpr('10+5+')).toBe(1500);
    expect(evalMoneyExpr('10×')).toBe(1000);
  });

  it('允许结果为负或为零（由调用方校验金额>0）', () => {
    expect(evalMoneyExpr('5-10')).toBe(-500);
    expect(evalMoneyExpr('5-5')).toBe(0);
    expect(evalMoneyExpr('-5+3')).toBe(-200); // 折叠后的负数结果可继续运算
  });

  it('非法输入返回 null', () => {
    expect(evalMoneyExpr('')).toBeNull();
    expect(evalMoneyExpr('.')).toBeNull();
    expect(evalMoneyExpr('+')).toBeNull();
    expect(evalMoneyExpr('abc')).toBeNull();
  });

  it('除以 0 返回 null', () => {
    expect(evalMoneyExpr('10÷0')).toBeNull();
    expect(evalMoneyExpr('10÷0+5')).toBeNull();
  });

  it('超出安全整数返回 null', () => {
    expect(evalMoneyExpr('99999999999999×99999999999999')).toBeNull();
  });
});

describe('appendCalcKey', () => {
  it('数字直接追加', () => {
    expect(appendCalcKey('', '5')).toBe('5');
    expect(appendCalcKey('12', '3')).toBe('123');
    expect(appendCalcKey('1+', '2')).toBe('1+2');
  });

  it('小数点：段内唯一，空段补 0', () => {
    expect(appendCalcKey('', '.')).toBe('0.');
    expect(appendCalcKey('1+', '.')).toBe('1+0.');
    expect(appendCalcKey('1.5', '.')).toBe('1.5');
    expect(appendCalcKey('1.5+2', '.')).toBe('1.5+2.');
  });

  it('每段最多两位小数', () => {
    expect(appendCalcKey('1.23', '4')).toBe('1.23');
    expect(appendCalcKey('1.23+4.56', '7')).toBe('1.23+4.56');
    expect(appendCalcKey('1.2', '3')).toBe('1.23');
  });

  it('运算符：空表达式仅接受负号、连按替换、尾点先去掉', () => {
    expect(appendCalcKey('', '+')).toBe('');
    expect(appendCalcKey('', '-')).toBe('-');
    expect(appendCalcKey('-', '5')).toBe('-5');
    expect(appendCalcKey('-', '.')).toBe('-0.');
    expect(appendCalcKey('5', '+')).toBe('5+');
    expect(appendCalcKey('5+', '×')).toBe('5×');
    expect(appendCalcKey('5.', '+')).toBe('5+');
  });

  it('退格删除末字符', () => {
    expect(appendCalcKey('123', '⌫')).toBe('12');
    expect(appendCalcKey('1+', '⌫')).toBe('1');
    expect(appendCalcKey('', '⌫')).toBe('');
  });

  it('折叠出的负数结果后可继续输入', () => {
    expect(appendCalcKey('-5.00', '+')).toBe('-5.00+');
    expect(appendCalcKey('-', '5')).toBe('-5');
  });
});

describe('applyCalcInput', () => {
  it('replaces a prefilled amount on the first numeric key', () => {
    expect(applyCalcInput('12.34', '5', true)).toEqual({
      expression: '5',
      replaceOnNextNumeric: false,
    });
    expect(applyCalcInput('12.34', '.', true)).toEqual({
      expression: '0.',
      replaceOnNextNumeric: false,
    });
  });

  it('edits a prefilled amount when the first key is an operator or backspace', () => {
    expect(applyCalcInput('12.34', '-', true)).toEqual({
      expression: '12.34-',
      replaceOnNextNumeric: false,
    });
    expect(applyCalcInput('12.34', '⌫', true)).toEqual({
      expression: '12.3',
      replaceOnNextNumeric: false,
    });
  });

  it('clears replacement mode with C and then accepts a leading minus', () => {
    const cleared = applyCalcInput('12.34', 'C', true);
    expect(cleared).toEqual({ expression: '', replaceOnNextNumeric: false });
    expect(applyCalcInput(cleared.expression, '-', cleared.replaceOnNextNumeric)).toEqual({
      expression: '-',
      replaceOnNextNumeric: false,
    });
  });
});

describe('hasPendingOp', () => {
  it('检测表达式中是否有待计算的运算符', () => {
    expect(hasPendingOp('10+5')).toBe(true);
    expect(hasPendingOp('10×')).toBe(true);
    expect(hasPendingOp('10')).toBe(false);
    expect(hasPendingOp('')).toBe(false);
    expect(hasPendingOp('-5.00')).toBe(false); // 首位负号不算运算符
    expect(hasPendingOp('-5.00+3')).toBe(true);
  });
});
