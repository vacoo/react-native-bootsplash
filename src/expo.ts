import {
  ConfigPlugin,
  withAndroidStyles,
  withAppDelegate,
  withPlugins,
} from "@expo/config-plugins";
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
    const { contents, language } = modResults;

    if (language !== "objc" && language !== "objcpp") {
      throw new Error(
        `Cannot setup ${PACKAGE_NAME} because the project AppDelegate is not a supported language: ${language}`,
      );
    }

    const withHeader = mergeContents({
      src: contents,
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
      offset: -1,
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
      $: { name: "BootTheme", parent: "Theme.BootSplash" },
      item,
    });

    return config;
  });

const withBootSplash: ConfigPlugin<Props> = (config, props) => {
  // TODO: use config.platforms
  // TODO: transform props here

  return withPlugins(config, [
    [withBootSplashAppDelegate, props],
    [withBootSplashAndroidStyles, props],
  ]);
};

export default withBootSplash;
