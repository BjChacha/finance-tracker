const {
  AndroidConfig,
  CodeGenerator,
  withAndroidStyles,
  withMainActivity,
} = require("expo/config-plugins");

const QUICK_ADD_HANDOFF_EXTRA = "expo.modules.quickkeypad.HANDOFF_ID";
const QUICK_ADD_STYLE = {
  name: "AppTheme.QuickAdd",
  parent: "AppTheme",
};
const QUICK_ADD_STYLE_ITEMS = [
  ["android:windowIsTranslucent", "true"],
  ["android:windowBackground", "@android:color/transparent"],
  ["android:backgroundDimEnabled", "false"],
  ["android:windowDisablePreview", "true"],
  ["android:windowContentTransitions", "false"],
];

function withQuickAddStyles(config) {
  return withAndroidStyles(config, (stylesConfig) => {
    let styles = stylesConfig.modResults;
    for (const [name, value] of QUICK_ADD_STYLE_ITEMS) {
      styles = AndroidConfig.Styles.setStylesItem({
        xml: styles,
        parent: QUICK_ADD_STYLE,
        item: {
          $: { name },
          _: value,
        },
      });
    }
    stylesConfig.modResults = styles;
    return stylesConfig;
  });
}

function withQuickAddMainActivity(config) {
  return withMainActivity(config, (activityConfig) => {
    const { language } = activityConfig.modResults;
    if (language !== "kt") {
      throw new Error("quick-keypad requires a Kotlin MainActivity");
    }

    const sourceWithoutStaticTheme = activityConfig.modResults.contents.replace(
      /^[ \t]+setTheme\(R\.style\.AppTheme\);?\r?\n/m,
      "",
    );
    const themeSelection = [
      `    val quickAddHandoffId = intent?.getStringExtra("${QUICK_ADD_HANDOFF_EXTRA}")`,
      "    setTheme(",
      "      if (quickAddHandoffId.isNullOrBlank()) {",
      "        R.style.AppTheme",
      "      } else {",
      "        R.style.AppTheme_QuickAdd",
      "      },",
      "    )",
    ].join("\n");
    const merged = CodeGenerator.mergeContents({
      src: sourceWithoutStaticTheme,
      newSrc: themeSelection,
      tag: "quick-add-theme-selection",
      anchor: /super\.onCreate\(null\)/,
      offset: 0,
      comment: "    //",
    });
    activityConfig.modResults.contents = merged.contents;
    return activityConfig;
  });
}

function withQuickKeypad(config) {
  config = withQuickAddStyles(config);
  config = withQuickAddMainActivity(config);
  return config;
}

module.exports = withQuickKeypad;
