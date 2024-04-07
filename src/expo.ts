import {
  ConfigPlugin,
  withAndroidManifest,
  withAndroidStyles,
  withAppDelegate,
  withMainActivity,
  withPlugins,
} from "@expo/config-plugins";
import { addImports } from "@expo/config-plugins/build/android/codeMod";
import { mergeContents } from "@expo/config-plugins/build/utils/generateCode";
import { dedent } from "ts-dedent";

const PACKAGE_NAME = "react-native-bootsplash";

type Props = {
  logo?: string;
  brand?: string;
};

const getTag = (name: string) => `${PACKAGE_NAME}-${name}`;

const logMalformedFileError = (file: string) =>
  console.error(
    `ERROR: Cannot add ${PACKAGE_NAME} to the project's ${file} because it's malformed. Please report this with a copy of your project ${file}.`,
  );

const withBootSplashAppDelegate: ConfigPlugin<Props> = (config, _props) =>
  withAppDelegate(config, (config) => {
    const { modResults } = config;
    const { language } = modResults;

    if (language !== "objc" && language !== "objcpp") {
      throw new Error(
        `Cannot setup ${PACKAGE_NAME} because the project AppDelegate is not a supported language: ${language}`,
      );
    }

    const withHeader = mergeContents({
      src: modResults.contents,
      comment: "//",
      tag: getTag("header"),
      offset: 1,
      anchor: /#import "AppDelegate\.h"/,
      newSrc: '#import "RNBootSplash.h"',
    });

    const withRootView = mergeContents({
      src: withHeader.contents,
      comment: "//",
      tag: getTag("init"),
      offset: 0,
      anchor: /@end/,
      newSrc: dedent`
        - (UIView *)createRootViewWithBridge:(RCTBridge *)bridge moduleName:(NSString *)moduleName initProps:(NSDictionary *)initProps {
          UIView *rootView = [super createRootViewWithBridge:bridge moduleName:moduleName initProps:initProps];
          [RNBootSplash initWithStoryboard:@"BootSplash" rootView:rootView];
          return rootView;
        }
      `,
    });

    if (!withHeader.didMerge || !withRootView.didMerge) {
      logMalformedFileError(`AppDelegate.${language === "objc" ? "m" : "mm"}`);
      return config;
    }

    return {
      ...config,
      modResults: {
        ...modResults,
        contents: withRootView.contents,
      },
    };
  });

const withBootSplashAndroidStyles: ConfigPlugin<Props> = (config, { brand }) =>
  withAndroidStyles(config, (config) => {
    const item = [
      {
        $: { name: "postBootSplashTheme" },
        _: "@style/AppTheme",
      },
      {
        $: { name: "bootSplashBackground" },
        _: "@color/bootsplash_background",
      },
      {
        $: { name: "bootSplashLogo" },
        _: "@drawable/bootsplash_logo",
      },
    ];

    if (brand != null) {
      item.push({
        $: { name: "bootSplashBrand" },
        _: "@drawable/bootsplash_brand",
      });
    }

    config.modResults.resources.style?.push({
      item,
      $: {
        name: "BootTheme",
        parent: "Theme.BootSplash",
      },
    });

    return config;
  });

const withBootSplashAndroidManifest: ConfigPlugin<Props> = (config, _props) =>
  withAndroidManifest(config, (config) => {
    config.modResults.manifest.application?.forEach((application) => {
      if (application.$["android:name"] === ".MainApplication") {
        const { activity } = application;

        activity?.forEach((activity) => {
          if (activity.$["android:name"] === ".MainActivity") {
            activity.$["android:theme"] = "@style/BootTheme";
          }
        });
      }
    });

    return config;
  });

const withBootSplashMainActivity: ConfigPlugin<Props> = (config, _props) =>
  withMainActivity(config, (config) => {
    const { modResults } = config;
    const { language } = modResults;

    const withImports = addImports(
      modResults.contents.replace(
        /setTheme\(R\.style\.AppTheme\)/,
        (line) => `// ${line}`,
      ),
      ["android.os.Bundle", "com.zoontek.rnbootsplash.RNBootSplash"],
      language === "java",
    );

    // indented with 4 spaces
    const withInit = mergeContents({
      src: withImports,
      comment: "    //",
      tag: getTag("init"),
      offset: 0,
      anchor: /super\.onCreate\(null\)/,
      newSrc:
        "    RNBootSplash.init(this, R.style.BootTheme)" +
        (language === "java" ? ";" : ""),
    });

    if (!withInit.didMerge) {
      logMalformedFileError(`MainActivity.${language}`);
      return config;
    }

    return {
      ...config,
      modResults: {
        ...modResults,
        contents: withInit.contents,
      },
    };
  });

const withBootSplash: ConfigPlugin<Props> = (config, props) => {
  // TODO: use config.platforms
  // TODO: transform props here

  return withPlugins(config, [
    [withBootSplashAppDelegate, props],
    [withBootSplashAndroidStyles, props],
    [withBootSplashAndroidManifest, props],
    [withBootSplashMainActivity, props],
  ]);
};

export default withBootSplash;
