import { View, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './Icon';

type IconBubbleProps = {
  name: IconName;
  /** 底色与图标实色（通常是分类/账户自带的 color） */
  color: string;
  size?: number;
  style?: ViewStyle;
};

/**
 * 带底色的圆角图标方块：用 color 的 ~20% 作底、color 实色画图标。
 * 替换原先分类列表(`categories/index.tsx`)与账户列表(`accounts/index.tsx`)里
 * 各自重复的“带底色 emoji 方块”，以及列表行的内联图标。
 */
export function IconBubble({ name, color, size = 36, style }: IconBubbleProps) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: `${color}33`,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.55)} color={color} />
    </View>
  );
}
