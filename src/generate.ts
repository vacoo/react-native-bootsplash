import murmurhash from "@emotion/hash";
import * as Expo from "@expo/config-plugins";
import { assignColorValue } from "@expo/config-plugins/build/android/Colors";
import { addImports } from "@expo/config-plugins/build/android/codeMod";
import { mergeContents } from "@expo/config-plugins/build/utils/generateCode";
import { get as getEnv } from "@expo/env";
import plist from "@expo/plist";
import { findProjectRoot } from "@react-native-community/cli-tools";
import {
  AndroidProjectConfig,
  IOSProjectConfig,
} from "@react-native-community/cli-types";
import detectIndent from "detect-indent";
import dotenv from "dotenv";
import fs from "fs";
import { parse as parseHtml } from "node-html-parser";
import path from "path";
import pc from "picocolors";
import { Options as PrettierOptions } from "prettier";
import * as htmlPlugin from "prettier/plugins/html";
import * as cssPlugin from "prettier/plugins/postcss";
import * as prettier from "prettier/standalone";
import sharp, { Sharp } from "sharp";
import { dedent } from "ts-dedent";
import formatXml, { XMLFormatterOptions } from "xml-formatter";
import { Manifest } from ".";

const workingPath = process.env.INIT_CWD ?? process.env.PWD ?? process.cwd();
const projectRoot = findProjectRoot(workingPath);

export type Color = {
  hex: string;
  rgb: {
    R: string;
    G: string;
    B: string;
  };
};

export const parseColor = (value: string): Color => {
  const up = value.toUpperCase().replace(/[^0-9A-F]/g, "");

  if (up.length !== 3 && up.length !== 6) {
    log.error(`"${value}" value is not a valid hexadecimal color.`);
    process.exit(1);
  }

  const hex =
    up.length === 3
      ? "#" + up[0] + up[0] + up[1] + up[1] + up[2] + up[2]
      : "#" + up;

  const rgb: Color["rgb"] = {
    R: (parseInt("" + hex[1] + hex[2], 16) / 255).toPrecision(15),
    G: (parseInt("" + hex[3] + hex[4], 16) / 255).toPrecision(15),
    B: (parseInt("" + hex[5] + hex[6], 16) / 255).toPrecision(15),
  };

  return { hex, rgb };
};

const getStoryboard = ({
  logoHeight,
  logoWidth,
  background: { R, G, B },
}: {
  logoHeight: number;
  logoWidth: number;
  background: Color["rgb"];
}) => {
  const frameWidth = 375;
  const frameHeight = 667;
  const logoX = (frameWidth - logoWidth) / 2;
  const logoY = (frameHeight - logoHeight) / 2;

  return dedent`
<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="21701" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina4_7" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="21678"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <!--View Controller-->
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController modalTransitionStyle="crossDissolve" id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" autoresizesSubviews="NO" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="${frameWidth}" height="${frameHeight}"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <subviews>
                            <imageView autoresizesSubviews="NO" clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFit" image="BootSplashLogo" translatesAutoresizingMaskIntoConstraints="NO" id="3lX-Ut-9ad">
                                <rect key="frame" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}"/>
                                <accessibility key="accessibilityConfiguration">
                                    <accessibilityTraits key="traits" image="YES" notEnabled="YES"/>
                                </accessibility>
                            </imageView>
                        </subviews>
                        <viewLayoutGuide key="safeArea" id="Bcu-3y-fUS"/>
                        <color key="backgroundColor" red="${R}" green="${G}" blue="${B}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                        <constraints>
                            <constraint firstItem="3lX-Ut-9ad" firstAttribute="centerX" secondItem="Ze5-6b-2t3" secondAttribute="centerX" id="Fh9-Fy-1nT"/>
                            <constraint firstItem="3lX-Ut-9ad" firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY" id="nvB-Ic-PnI"/>
                        </constraints>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="0.0" y="0.0"/>
        </scene>
    </scenes>
    <resources>
        <image name="BootSplashLogo" width="${logoWidth}" height="${logoHeight}"/>
    </resources>
</document>
`;
};

export const addFileToXcodeProject = (filePath: string) => {
  const pbxprojectPath = Expo.IOSConfig.Paths.getPBXProjectPath(projectRoot);
  const project = Expo.IOSConfig.XcodeUtils.getPbxproj(projectRoot);

  const xcodeProjectPath =
    Expo.IOSConfig.Paths.getXcodeProjectPath(projectRoot);

  Expo.IOSConfig.XcodeUtils.addResourceFileToGroup({
    filepath: filePath,
    groupName: path.parse(xcodeProjectPath).name,
    project,
    isBuildFile: true,
  });

  hfs.write(pbxprojectPath, project.writeSync());
  logWrite(pbxprojectPath);
};

// Freely inspired by https://github.com/humanwhocodes/humanfs
export const hfs = {
  buffer: (path: string) => fs.readFileSync(path),
  exists: (path: string) => fs.existsSync(path),
  json: (path: string) => JSON.parse(fs.readFileSync(path, "utf-8")) as unknown,
  readDir: (path: string) => fs.readdirSync(path, "utf-8"),
  realPath: (path: string) => fs.realpathSync(path, "utf-8"),
  rm: (path: string) => fs.rmSync(path, { force: true }),
  text: (path: string) => fs.readFileSync(path, "utf-8"),

  ensureDir: (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
  },
  write: (file: string, data: string) => {
    const trimmed = data.trim();
    fs.writeFileSync(file, trimmed === "" ? trimmed : trimmed + "\n", "utf-8");
  },
};

export const log = {
  error: (text: string) => console.log(pc.red(`❌  ${text}`)),
  text: (text: string) => console.log(text),
  title: (emoji: string, text: string) =>
    console.log(`\n${emoji}  ${pc.underline(pc.bold(text))}`),
  warn: (text: string) => console.log(pc.yellow(`⚠️   ${text}`)),
};

export const logWrite = (
  filePath: string,
  dimensions?: { width: number; height: number },
) =>
  console.log(
    `    ${path.relative(workingPath, filePath)}` +
      (dimensions != null ? ` (${dimensions.width}x${dimensions.height})` : ""),
  );

export const writeJson = (file: string, json: object) => {
  hfs.write(file, JSON.stringify(json, null, 2));
  logWrite(file);
};

export const readXml = (file: string) => {
  const xml = hfs.text(file);
  const { indent } = detectIndent(xml);

  const formatOptions: XMLFormatterOptions = {
    indentation: indent || "    ",
  };

  return { root: parseHtml(xml), formatOptions };
};

export const writeXml = (
  file: string,
  xml: string,
  options?: XMLFormatterOptions,
) => {
  const formatted = formatXml(xml, {
    collapseContent: true,
    forceSelfClosingEmptyTag: true,
    indentation: "    ",
    lineSeparator: "\n",
    whiteSpaceAtEndOfSelfclosingTag: true,
    ...options,
  });

  hfs.write(file, formatted);
  logWrite(file);
};

export const readHtml = (file: string) => {
  const html = hfs.text(file);
  const { type, amount } = detectIndent(html);

  const formatOptions: PrettierOptions = {
    useTabs: type === "tab",
    tabWidth: amount || 2,
  };

  return { root: parseHtml(html), formatOptions };
};

export const writeHtml = async (
  file: string,
  html: string,
  options?: Omit<PrettierOptions, "parser" | "plugins">,
) => {
  const formatted = await prettier.format(html, {
    parser: "html",
    plugins: [htmlPlugin, cssPlugin],
    tabWidth: 2,
    useTabs: false,
    ...options,
  });

  hfs.write(file, formatted);
  logWrite(file);
};

export const cleanIosAssets = (dir: string, prefix: string) => {
  hfs
    .readDir(dir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".png"))
    .map((file) => path.join(dir, file))
    .forEach((file) => hfs.rm(file));
};

export const getIosAssetFileName = async ({
  name,
  image,
  width,
}: {
  name: string;
  image: Sharp;
  width: number;
}) => {
  const buffer = await image
    .clone()
    .resize(width)
    .png({ quality: 100 })
    .toBuffer();

  const hash = murmurhash(buffer.toString("base64"));
  return `${name}-${hash}`;
};

export const ensureSupportedFormat = async (
  name: string,
  image: Sharp | undefined,
) => {
  if (image == null) {
    return;
  }

  const { format } = await image.metadata();

  if (format !== "png" && format !== "svg") {
    log.error(`${name} image file format (${format}) is not supported`);
    process.exit(1);
  }
};

export const getAndroidResPath = ({
  appName,
  flavor,
  sourceDir,
}: {
  appName: string;
  flavor: string;
  sourceDir: string;
}): string | undefined => {
  const androidResPath = path.resolve(sourceDir, appName, "src", flavor, "res");

  if (!hfs.exists(androidResPath)) {
    log.warn(
      `No ${path.relative(
        workingPath,
        androidResPath,
      )} directory found. Skipping Android assets generation…`,
    );
  } else {
    return androidResPath;
  }
};

export const getIosProjectPath = ({
  projectName,
  sourceDir,
}: {
  projectName: string;
  sourceDir: string;
}): string | undefined => {
  const iosProjectPath = path.resolve(sourceDir, projectName);

  if (!hfs.exists(iosProjectPath)) {
    log.warn(
      `No ${path.relative(
        workingPath,
        iosProjectPath,
      )} directory found. Skipping iOS assets generation…`,
    );
  } else {
    return iosProjectPath;
  }
};

const getHtmlTemplatePath = (html: string): string | undefined => {
  const htmlTemplatePath = path.resolve(workingPath, html);

  if (!hfs.exists(htmlTemplatePath)) {
    log.warn(
      `No ${path.relative(
        workingPath,
        htmlTemplatePath,
      )} file found. Skipping HTML + CSS generation…`,
    );
  } else {
    return htmlTemplatePath;
  }
};

type CommonArgs = {
  platforms: string[];
  logo: string;
  background: string;
  logoWidth: number;
  assetsOutput?: string;
  html: string;
  flavor: string;

  licenseKey?: string;
  brand?: string;
  brandWidth: number;
  darkBackground?: string;
  darkLogo?: string;
  darkBrand?: string;
};

const transformArgs = (isExpo: boolean, args: CommonArgs) => {
  const [nodeStringVersion = ""] = process.versions.node.split(".");
  const nodeVersion = parseInt(nodeStringVersion, 10);

  if (!isNaN(nodeVersion) && nodeVersion < 18) {
    log.error("Requires Node 18 (or higher)");
    process.exit(1);
  }

  const { flavor, platforms } = args;

  const hasAndroidPlatform = platforms.includes("android");
  const hasIosPlatform = platforms.includes("ios");
  const hasWebPlatform = platforms.includes("web");
  const basePlatform = hasIosPlatform ? "android" : "ios";

  const logoPath = path.resolve(workingPath, args.logo);

  const darkLogoPath =
    args.darkLogo != null
      ? path.resolve(workingPath, args.darkLogo)
      : undefined;

  const brandPath =
    args.brand != null ? path.resolve(workingPath, args.brand) : undefined;

  const darkBrandPath =
    args.darkBrand != null
      ? path.resolve(workingPath, args.darkBrand)
      : undefined;

  const assetsOutputPath =
    args.assetsOutput != null
      ? path.resolve(workingPath, args.assetsOutput)
      : undefined;

  const htmlTemplatePath = hasWebPlatform
    ? getHtmlTemplatePath(args.html)
    : undefined;

  const logo = sharp(logoPath);
  const darkLogo = darkLogoPath != null ? sharp(darkLogoPath) : undefined;
  const brand = brandPath != null ? sharp(brandPath) : undefined;
  const darkBrand = darkBrandPath != null ? sharp(darkBrandPath) : undefined;

  const background = parseColor(args.background);
  const darkBackground =
    args.darkBackground != null ? parseColor(args.darkBackground) : undefined;

  const logoWidth = args.logoWidth - (args.logoWidth % 2);
  const brandWidth = args.brandWidth - (args.brandWidth % 2);

  if (logoWidth < args.logoWidth) {
    log.warn(
      `Logo width must be a multiple of 2. It has been rounded to ${logoWidth}dp.`,
    );
  }
  if (brandWidth < args.brandWidth) {
    log.warn(
      `Brand width must be a multiple of 2. It has been rounded to ${brandWidth}dp.`,
    );
  }

  const executeAddon =
    brand != null ||
    darkBackground != null ||
    darkLogo != null ||
    darkBrand != null;

  const licenseKey = executeAddon ? args.licenseKey : undefined;

  if (args.licenseKey != null && !executeAddon) {
    log.warn(
      `You specified a license key but none of the options that requires it.`,
    );
  }

  const optionNames = {
    brand: isExpo ? "brand" : "--brand",
    darkBackground: isExpo ? "darkBackground" : "--dark-background",
    darkLogo: isExpo ? "darkLogo" : "--dark-logo",
    darkBrand: isExpo ? "darkBrand" : "--dark-brand",
  };

  if (args.licenseKey == null && executeAddon) {
    const options = [
      brand != null ? optionNames.brand : "",
      darkBackground != null ? optionNames.darkBackground : "",
      darkLogo != null ? optionNames.darkLogo : "",
      darkBrand != null ? optionNames.darkBrand : "",
    ]
      .filter((option) => option !== "")
      .join(", ");

    log.error(`You need to specify a license key in order to use ${options}.`);
    process.exit(1);
  }

  if (brand == null && darkBrand != null) {
    log.error(
      `${optionNames.darkBrand} option couldn't be used without ${optionNames.brand}.`,
    );
    process.exit(1);
  }

  return {
    assetsOutputPath,
    background,
    basePlatform,
    brand,
    brandPath,
    brandWidth,
    darkBackground,
    darkBrand,
    darkBrandPath,
    darkLogo,
    darkLogoPath,
    flavor,
    hasAndroidPlatform,
    hasIosPlatform,
    htmlTemplatePath,
    licenseKey,
    logo,
    logoPath,
    logoWidth,
  } as const;
};

export type Props = ReturnType<typeof transformArgs>;

export type AddonProps = Props & {
  androidResPath: string | undefined;
  iosProjectPath: string | undefined;
};

export type PlatformsPlugins = {
  android: Expo.ConfigPlugin<Props>[];
  ios: Expo.ConfigPlugin<Props>[];
  generic: Expo.ConfigPlugin<Props>[];
};

const requireAddon = ():
  | {
      execute: (props: AddonProps) => Promise<void>;
      plugins: PlatformsPlugins;
    }
  | undefined => {
  try {
    return require("./addon"); // eslint-disable-line
  } catch {
    return;
  }
};

export const getImageHeight = (
  image: Sharp | undefined,
  width: number,
): Promise<number> => {
  if (image == null) {
    return Promise.resolve(0);
  }

  return image
    .clone()
    .resize(width)
    .toBuffer()
    .then((buffer) => sharp(buffer).metadata())
    .then(({ height = 0 }) => Math.round(height));
};

export const generateAndroidAssets = async ({
  androidResPath,
  logo,
  logoWidth,
}: Props & {
  androidResPath: string;
}): Promise<void> => {
  await ensureSupportedFormat("Logo", logo);

  log.title("🤖", "Android");

  const logoHeight = await getImageHeight(logo, logoWidth);

  if (logoWidth > 288 || logoHeight > 288) {
    return log.warn(
      "Logo size exceeding 288x288dp will be cropped by Android. Skipping Android assets generation…",
    );
  }

  if (logoWidth > 192 || logoHeight > 192) {
    log.warn(`Logo size exceeds 192x192dp. It might be cropped by Android.`);
  }

  await Promise.all(
    [
      { ratio: 1, suffix: "mdpi" },
      { ratio: 1.5, suffix: "hdpi" },
      { ratio: 2, suffix: "xhdpi" },
      { ratio: 3, suffix: "xxhdpi" },
      { ratio: 4, suffix: "xxxhdpi" },
    ].map(({ ratio, suffix }) => {
      const drawableDirPath = path.resolve(
        androidResPath,
        `drawable-${suffix}`,
      );

      hfs.ensureDir(drawableDirPath);

      // https://developer.android.com/develop/ui/views/launch/splash-screen#dimensions
      const canvasSize = 288 * ratio;

      // https://sharp.pixelplumbing.com/api-constructor
      const canvas = sharp({
        create: {
          width: canvasSize,
          height: canvasSize,
          channels: 4,
          background: {
            r: 255,
            g: 255,
            b: 255,
            alpha: 0,
          },
        },
      });

      const filePath = path.resolve(drawableDirPath, "bootsplash_logo.png");

      return logo
        .clone()
        .resize(logoWidth * ratio)
        .toBuffer()
        .then((input) =>
          canvas.composite([{ input }]).png({ quality: 100 }).toFile(filePath),
        )
        .then(() => {
          logWrite(filePath, {
            width: canvasSize,
            height: canvasSize,
          });
        });
    }),
  );
};

export const generateIosAssets = async ({
  background,
  iosProjectPath,
  logo,
  logoWidth,
}: Props & {
  iosProjectPath: string;
}): Promise<void> => {
  await ensureSupportedFormat("Logo", logo);

  log.title("🍏", "iOS");

  const logoHeight = await getImageHeight(logo, logoWidth);

  const storyboardPath = path.resolve(iosProjectPath, "BootSplash.storyboard");

  writeXml(
    storyboardPath,
    getStoryboard({
      logoHeight,
      logoWidth,
      background: background.rgb,
    }),
    { whiteSpaceAtEndOfSelfclosingTag: false },
  );

  const imageSetPath = path.resolve(
    iosProjectPath,
    "Images.xcassets",
    "BootSplashLogo.imageset",
  );

  hfs.ensureDir(imageSetPath);
  cleanIosAssets(imageSetPath, "bootsplash_logo");

  const logoFileName = await getIosAssetFileName({
    name: "bootsplash_logo",
    image: logo,
    width: logoWidth,
  });

  writeJson(path.resolve(imageSetPath, "Contents.json"), {
    images: [
      {
        idiom: "universal",
        filename: `${logoFileName}.png`,
        scale: "1x",
      },
      {
        idiom: "universal",
        filename: `${logoFileName}@2x.png`,
        scale: "2x",
      },
      {
        idiom: "universal",
        filename: `${logoFileName}@3x.png`,
        scale: "3x",
      },
    ],
    info: {
      author: "xcode",
      version: 1,
    },
  });

  await Promise.all(
    [
      { ratio: 1, suffix: "" },
      { ratio: 2, suffix: "@2x" },
      { ratio: 3, suffix: "@3x" },
    ].map(({ ratio, suffix }) => {
      const filePath = path.resolve(
        imageSetPath,
        `${logoFileName}${suffix}.png`,
      );

      return logo
        .clone()
        .resize(logoWidth * ratio)
        .png({ quality: 100 })
        .toFile(filePath)
        .then(({ width, height }) => {
          logWrite(filePath, { width, height });
        });
    }),
  );
};

export const generateWebAssets = async ({
  background,
  htmlTemplatePath,
  logo,
  logoPath,
  logoWidth,
}: Props & {
  htmlTemplatePath: string;
}): Promise<void> => {
  await ensureSupportedFormat("Logo", logo);

  log.title("🌐", "Web");

  const logoHeight = await getImageHeight(logo, logoWidth);

  const { root, formatOptions } = readHtml(htmlTemplatePath);
  const { format } = await logo.metadata();
  const prevStyle = root.querySelector("#bootsplash-style");

  const base64 = (
    format === "svg"
      ? hfs.buffer(logoPath)
      : await logo
          .clone()
          .resize(Math.round(logoWidth * 2))
          .png({ quality: 100 })
          .toBuffer()
  ).toString("base64");

  const dataURI = `data:image/${format ? "svg+xml" : "png"};base64,${base64}`;

  const nextStyle = parseHtml(dedent`
    <style id="bootsplash-style">
      #bootsplash {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: ${background.hex};
      }
      #bootsplash-logo {
        content: url("${dataURI}");
        width: ${logoWidth}px;
        height: ${logoHeight}px;
      }
    </style>
  `);

  if (prevStyle != null) {
    prevStyle.replaceWith(nextStyle);
  } else {
    root.querySelector("head")?.appendChild(nextStyle);
  }

  const prevDiv = root.querySelector("#bootsplash");

  const nextDiv = parseHtml(dedent`
    <div id="bootsplash">
      <div id="bootsplash-logo"></div>
    </div>
  `);

  if (prevDiv != null) {
    prevDiv.replaceWith(nextDiv);
  } else {
    root.querySelector("body")?.appendChild(nextDiv);
  }

  return writeHtml(htmlTemplatePath, root.toString(), formatOptions);
};

export const generateGenericAssets = async ({
  assetsOutputPath,
  background,
  logo,
  logoWidth,
}: Props & {
  assetsOutputPath: string;
}): Promise<void> => {
  await ensureSupportedFormat("Logo", logo);

  log.title("📄", "Assets");

  const logoHeight = await getImageHeight(logo, logoWidth);

  hfs.ensureDir(assetsOutputPath);

  writeJson(path.resolve(assetsOutputPath, "bootsplash_manifest.json"), {
    background: background.hex,
    logo: {
      width: logoWidth,
      height: logoHeight,
    },
  } satisfies Manifest);

  await Promise.all(
    [
      { ratio: 1, suffix: "" },
      { ratio: 1.5, suffix: "@1,5x" },
      { ratio: 2, suffix: "@2x" },
      { ratio: 3, suffix: "@3x" },
      { ratio: 4, suffix: "@4x" },
    ].map(({ ratio, suffix }) => {
      const filePath = path.resolve(
        assetsOutputPath,
        `bootsplash_logo${suffix}.png`,
      );

      return logo
        .clone()
        .resize(Math.round(logoWidth * ratio))
        .png({ quality: 100 })
        .toFile(filePath)
        .then(({ width, height }) => {
          logWrite(filePath, { width, height });
        });
    }),
  );
};

export const generate = async ({
  android,
  ios,
  ...args
}: {
  android?: AndroidProjectConfig;
  ios?: IOSProjectConfig;
} & CommonArgs) => {
  const projectName = ios?.xcodeProject?.name;
  const props = transformArgs(false, args);

  const {
    assetsOutputPath,
    background,
    hasAndroidPlatform,
    hasIosPlatform,
    htmlTemplatePath,
    licenseKey,
  } = props;

  if (ios != null && projectName == null) {
    log.warn("No Xcode project found. Skipping iOS assets generation…");
  }

  const androidResPath =
    hasAndroidPlatform && android != null
      ? getAndroidResPath({
          appName: android.appName,
          flavor: args.flavor,
          sourceDir: android.sourceDir,
        })
      : undefined;

  const iosProjectPath =
    hasIosPlatform && ios != null && projectName != null
      ? getIosProjectPath({
          sourceDir: ios.sourceDir,
          projectName: projectName.replace(/\.(xcodeproj|xcworkspace)$/, ""),
        })
      : undefined;

  if (androidResPath != null) {
    await generateAndroidAssets({ ...props, androidResPath });

    const valuesPath = path.resolve(androidResPath, "values");
    hfs.ensureDir(valuesPath);

    const colorsXmlPath = path.resolve(valuesPath, "colors.xml");
    const colorsXmlEntry = `<color name="bootsplash_background">${background.hex}</color>`;

    if (hfs.exists(colorsXmlPath)) {
      const { root, formatOptions } = readXml(colorsXmlPath);
      const nextColor = parseHtml(colorsXmlEntry);
      const prevColor = root.querySelector(
        'color[name="bootsplash_background"]',
      );

      if (prevColor != null) {
        prevColor.replaceWith(nextColor);
      } else {
        root.querySelector("resources")?.appendChild(nextColor);
      }

      writeXml(colorsXmlPath, root.toString(), formatOptions);
    } else {
      writeXml(colorsXmlPath, `<resources>${colorsXmlEntry}</resources>`);
    }
  }

  if (iosProjectPath != null) {
    await generateIosAssets({ ...props, iosProjectPath });

    addFileToXcodeProject(
      path.join(path.basename(iosProjectPath), "BootSplash.storyboard"),
    );

    const infoPlistPath = path.join(iosProjectPath, "Info.plist");

    const infoPlist = plist.parse(hfs.text(infoPlistPath)) as Record<
      string,
      unknown
    >;

    infoPlist["UILaunchStoryboardName"] = "BootSplash";

    const formatted = formatXml(plist.build(infoPlist), {
      collapseContent: true,
      forceSelfClosingEmptyTag: false,
      indentation: "\t",
      lineSeparator: "\n",
      whiteSpaceAtEndOfSelfclosingTag: false,
    })
      .replace(/<string\/>/gm, "<string></string>")
      .replace(/^\t/gm, "");

    hfs.write(infoPlistPath, formatted);
    logWrite(infoPlistPath);
  }

  if (htmlTemplatePath != null) {
    await generateWebAssets({ ...props, htmlTemplatePath });
  }

  if (assetsOutputPath != null) {
    await generateGenericAssets({ ...props, assetsOutputPath });
  }

  if (licenseKey != null) {
    const addon = requireAddon();

    await addon?.execute({
      ...props,
      androidResPath,
      iosProjectPath,
    });
  } else {
    log.text(`
${pc.blue("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓")}
${pc.blue("┃")}  🔑  ${pc.bold(
      "Get a license key for brand image / dark mode support",
    )}  ${pc.blue("┃")}
${pc.blue("┃")}      ${pc.underline(
      "https://zoontek.gumroad.com/l/bootsplash-generator",
    )}     ${pc.blue("┃")}
${pc.blue("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛")}`);
  }

  log.text(`\n💖  Thanks for using ${pc.underline("react-native-bootsplash")}`);
};

// Expo plugin

const logFileUpdateError = (file: string) =>
  log.error(`Cannot modify ${file} because it's malformed. Please report it.`);

const withAndroidAssets: Expo.ConfigPlugin<Props> = (config, props) =>
  Expo.withDangerousMod(config, [
    "android",
    async (config) => {
      const { platformProjectRoot } = config.modRequest;
      const { flavor } = props;

      const androidResPath = getAndroidResPath({
        appName: "app",
        flavor,
        sourceDir: platformProjectRoot,
      });

      if (androidResPath != null) {
        await generateAndroidAssets({ ...props, androidResPath });
      }

      return config;
    },
  ]);

const withAndroidColors: Expo.ConfigPlugin<Props> = (config, props) =>
  Expo.withAndroidColors(config, (config) => {
    const { background } = props;

    config.modResults = assignColorValue(config.modResults, {
      name: "bootsplash_background",
      value: background.hex.toLowerCase(),
    });

    return config;
  });

const withAndroidManifest: Expo.ConfigPlugin<Props> = (config) =>
  Expo.withAndroidManifest(config, (config) => {
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

const withMainActivity: Expo.ConfigPlugin<Props> = (config) =>
  Expo.withMainActivity(config, (config) => {
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
      tag: "bootsplash-init",
      offset: 0,
      anchor: /super\.onCreate\(null\)/,
      newSrc:
        "    RNBootSplash.init(this, R.style.BootTheme)" +
        (language === "java" ? ";" : ""),
    });

    if (!withInit.didMerge) {
      logFileUpdateError(`MainActivity.${language}`);
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

const withAndroidStyles: Expo.ConfigPlugin<Props> = (config, props) =>
  Expo.withAndroidStyles(config, (config) => {
    const { brand } = props;

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

const withIosAssets: Expo.ConfigPlugin<Props> = (config, props) =>
  Expo.withDangerousMod(config, [
    "ios",
    async (config) => {
      const { platformProjectRoot, projectName = "" } = config.modRequest;

      const iosProjectPath = getIosProjectPath({
        sourceDir: platformProjectRoot,
        projectName,
      });

      if (iosProjectPath != null) {
        await generateIosAssets({ ...props, iosProjectPath });
      }

      return config;
    },
  ]);

const withAppDelegate: Expo.ConfigPlugin<Props> = (config) =>
  Expo.withAppDelegate(config, (config) => {
    const { modResults } = config;
    const { language } = modResults;

    if (language !== "objc" && language !== "objcpp") {
      throw new Error(
        `Cannot modify the project AppDelegate as it's not in a supported language: ${language}`,
      );
    }

    const withHeader = mergeContents({
      src: modResults.contents,
      comment: "//",
      tag: "bootsplash-header",
      offset: 1,
      anchor: /#import "AppDelegate\.h"/,
      newSrc: '#import "RNBootSplash.h"',
    });

    const withRootView = mergeContents({
      src: withHeader.contents,
      comment: "//",
      tag: "bootsplash-init",
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
      logFileUpdateError(`AppDelegate.${language === "objc" ? "m" : "mm"}`);
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

const withInfoPlist: Expo.ConfigPlugin<Props> = (config) =>
  Expo.withInfoPlist(config, (config) => {
    config.modResults["UILaunchStoryboardName"] = "BootSplash";
    return config;
  });

const withXcodeProject: Expo.ConfigPlugin<Props> = (config) =>
  Expo.withXcodeProject(config, (config) => {
    const { platformProjectRoot, projectName = "" } = config.modRequest;
    const xcodeProjectPath = path.join(platformProjectRoot, projectName);

    Expo.IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: path.join(xcodeProjectPath, "BootSplash.storyboard"),
      groupName: projectName,
      project: config.modResults,
      isBuildFile: true,
    });

    return config;
  });

const withGenericAssets: Expo.ConfigPlugin<Props> = (config, props) =>
  Expo.withDangerousMod(config, [
    props.basePlatform,
    async (config) => {
      const { assetsOutputPath } = props;

      if (assetsOutputPath != null) {
        await generateGenericAssets({ ...props, assetsOutputPath });
      }

      return config;
    },
  ]);

const getEnvFileLicenseKey = () => {
  const absoluteDotenvFile = getEnv(projectRoot).files[0];

  if (absoluteDotenvFile != null) {
    const env = dotenv.parse(hfs.text(absoluteDotenvFile));
    return env["BOOTSPLASH_LICENSE_KEY"];
  }
};

export const withGenerate: Expo.ConfigPlugin<{
  assetsOutput?: string;
  background?: string;
  brand?: string;
  brandWidth?: number;
  darkBackground?: string;
  darkBrand?: string;
  darkLogo?: string;
  licenseKey?: string;
  logo?: string;
  logoWidth?: number;
}> = (config, args = {}) => {
  const plugins: Expo.ConfigPlugin<Props>[] = [];

  const { platforms = [] } = config;
  const { logo } = args;

  if (logo == null) {
    log.error("Missing required argument 'logo'");
    process.exit(1);
  }

  const props = transformArgs(true, {
    ...args,
    platforms,
    logo,
    background: args.background ?? "#fff",
    logoWidth: args.logoWidth ?? 100,
    brandWidth: args.brandWidth ?? 80,
    licenseKey: args.licenseKey ?? getEnvFileLicenseKey(),
    flavor: "main",
    html: "index.html",
  });

  const { hasAndroidPlatform, hasIosPlatform, licenseKey } = props;

  if (!hasAndroidPlatform && !hasIosPlatform) {
    return config;
  }

  const platformsPlugins: PlatformsPlugins = (licenseKey != null
    ? requireAddon()?.plugins
    : undefined) ?? {
    android: [withAndroidAssets],
    ios: [withIosAssets],
    generic: [withGenericAssets],
  };

  if (hasAndroidPlatform) {
    plugins.push(
      ...platformsPlugins.android,
      withAndroidColors,
      withAndroidManifest,
      withMainActivity,
      withAndroidStyles,
    );
  }

  if (hasIosPlatform) {
    plugins.push(
      ...platformsPlugins.ios,
      withAppDelegate,
      withInfoPlist,
      withXcodeProject,
    );
  }

  plugins.push(...platformsPlugins.generic);

  return Expo.withPlugins(
    config,
    plugins.map((plugin) => [plugin, props] as const),
  );
};
