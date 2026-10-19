const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  CodeGenerator,
  withAndroidManifest,
  withAndroidStyles,
  withDangerousMod,
  withMainActivity,
  withGradleProperties,
} = require("expo/config-plugins");

const QUICK_ADD_HANDOFF_EXTRA = "expo.modules.quickkeypad.HANDOFF_ID";
const TRANSLUCENT_LAUNCH_EXTRA = "expo.modules.quickkeypad.TRANSLUCENT_LAUNCH";
const TRANSPARENT_LAUNCH_STYLE = {
  name: "AppTheme.TransparentLaunch",
  parent: "AppTheme",
};
const TRANSPARENT_LAUNCH_STYLE_ITEMS = [
  ["android:windowIsTranslucent", "false"],
  ["android:windowBackground", "@color/quick_handoff_background"],
  ["android:windowDisablePreview", "true"],
  ["android:windowContentTransitions", "false"],
  ["android:statusBarColor", "@color/quick_handoff_background"],
  ["android:navigationBarColor", "@color/quick_handoff_background"],
];
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
const ANDROID_12_LAUNCH_STYLES = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="AppTheme.TransparentLaunch" parent="AppTheme">
    <item name="android:windowIsTranslucent">true</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:backgroundDimEnabled">false</item>
    <item name="android:windowDisablePreview">true</item>
    <item name="android:windowContentTransitions">false</item>
    <item name="android:windowSplashScreenBackground">@android:color/transparent</item>
    <item name="android:windowSplashScreenAnimatedIcon">@android:color/transparent</item>
    <item name="android:windowSplashScreenAnimationDuration">0</item>
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:navigationBarColor">@android:color/transparent</item>
  </style>
</resources>
`;

function withQuickAddStyles(config) {
  return withAndroidStyles(config, (stylesConfig) => {
    let styles = stylesConfig.modResults;
    for (const [parent, items] of [
      [TRANSPARENT_LAUNCH_STYLE, TRANSPARENT_LAUNCH_STYLE_ITEMS],
      [QUICK_ADD_STYLE, QUICK_ADD_STYLE_ITEMS],
    ]) {
      for (const [name, value] of items) {
        styles = AndroidConfig.Styles.setStylesItem({
          xml: styles,
          parent,
          item: {
            $: { name },
            _: value,
          },
        });
      }
    }
    stylesConfig.modResults = styles;
    return stylesConfig;
  });
}

function withAndroid12TransparentLaunchStyle(config) {
  return withDangerousMod(config, [
    "android",
    async (dangerousConfig) => {
      const resourceDirectory = path.join(
        dangerousConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "values-v31",
      );
      await fs.promises.mkdir(resourceDirectory, { recursive: true });
      await fs.promises.writeFile(
        path.join(resourceDirectory, "quick_keypad_launch_styles.xml"),
        ANDROID_12_LAUNCH_STYLES,
        "utf8",
      );
      return dangerousConfig;
    },
  ]);
}

function withTransparentLaunchManifest(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      manifestConfig.modResults,
    );
    mainActivity.$["android:theme"] = "@style/AppTheme.TransparentLaunch";
    return manifestConfig;
  });
}

function withQuickAddMainActivity(config) {
  return withMainActivity(config, (activityConfig) => {
    const { language } = activityConfig.modResults;
    if (language !== "kt") {
      throw new Error("quick-keypad requires a Kotlin MainActivity");
    }

    const sourceWithoutStaticTheme = activityConfig.modResults.contents
      .replace(
        /    \/\/ Set the theme to AppTheme BEFORE onCreate to support\r?\n    \/\/ coloring the background, status bar, and navigation bar\.\r?\n    \/\/ This is required for expo-splash-screen\.\r?\n/,
        "    // Select the launch theme before ReactActivity creates its window.\n",
      )
      .replace(/^[ \t]+setTheme\(R\.style\.AppTheme\);?\r?\n/m, "");
    const themeSelection = [
      `    val quickAddHandoffId = intent?.getStringExtra("${QUICK_ADD_HANDOFF_EXTRA}")`,
      `    val translucentLaunch = intent?.getBooleanExtra("${TRANSLUCENT_LAUNCH_EXTRA}", false) == true`,
      "    setTheme(",
      "      if (quickAddHandoffId.isNullOrBlank() && !translucentLaunch) {",
      "        R.style.AppTheme_TransparentLaunch",
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
  config = withGradleProperties(config, (mod) => {
    const properties = mod.modResults.filter((item) => item.key !== "expo.useLegacyPackaging");
    properties.push({ type: "property", key: "expo.useLegacyPackaging", value: "true" });
    mod.modResults = properties;
    return mod;
  });
  config = withQuickAddStyles(config);
  config = withAndroid12TransparentLaunchStyle(config);
  config = withTransparentLaunchManifest(config);
  config = withQuickAddMainActivity(config);
  return config;
}

module.exports = withQuickKeypad;
