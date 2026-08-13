import type {
  ModelSelection,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
  RuntimeMode,
} from "@t3tools/contracts";
import {
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
} from "@t3tools/shared/model";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { cn } from "../../lib/cn";
import type { ModelOption, ProviderGroup } from "../../lib/modelOptions";
import { applyProviderOptionSelection } from "../../lib/providerOptions";
import { resolveProviderOptionDescriptors } from "../../lib/providerOptions";
import { useThemeColor } from "../../lib/useThemeColor";
import { NativeHeaderToolbar, NativeStackScreenOptions } from "../../native/StackHeader";
import {
  NATIVE_SHEET_SURFACE_COLOR,
  NATIVE_SHEET_SURFACE_CONTENT_STYLE,
} from "../../native/sheet-surface";
import { useNewTaskFlow } from "./new-task-flow-provider";
import { useNewTaskSettingsTransition } from "./new-task-settings-transition";
import {
  createNativeMailSearchToolbarItem,
  NATIVE_MAIL_SEARCH_TOOLBAR_CONTENT_INSET,
  NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED,
} from "../layout/native-mail-search-toolbar";
import { RUNTIME_MODE_CHOICES, selectableChoices } from "./thread-settings-options";
import { modelMatchesCatalogQuery, pendingModelAfterPress } from "./thread-settings-sheet-state";

/**
 * The everyday harnesses stay expanded; every other provider (OpenRouter
 * catalogs and friends) folds behind its header so a 300-model catalog can't
 * bury the list.
 */
const PRIMARY_PROVIDER_DRIVERS: ReadonlySet<string> = new Set(["claudeAgent", "codex"]);
function ModelRow(props: {
  readonly option: ModelOption;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly isFirst: boolean;
  readonly isLast: boolean;
}) {
  const checkmarkColor = useThemeColor("--color-icon");
  return (
    <Pressable
      accessibilityLabel={props.option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      className={cn(
        "mx-4 min-h-11 flex-row items-center gap-2 bg-card px-4 py-2 active:bg-subtle",
        props.isFirst && "rounded-t-2xl",
        props.isLast ? "rounded-b-2xl" : "border-b border-border-subtle",
      )}
    >
      <Text className="min-w-0 shrink text-base font-t3-medium text-foreground" numberOfLines={1}>
        {props.option.label}
      </Text>
      {props.option.isDefault ? (
        <View className="rounded-md bg-subtle-strong px-1.5 py-0.5">
          <Text className="text-3xs font-t3-bold text-foreground-muted">Default</Text>
        </View>
      ) : null}
      {props.option.isLegacy ? (
        <View className="rounded-md bg-subtle px-1.5 py-0.5">
          <Text className="text-3xs font-t3-bold text-foreground-muted">Legacy</Text>
        </View>
      ) : null}
      <View className="flex-1" />
      {props.selected ? (
        <SymbolView
          name="checkmark"
          size={16}
          tintColor={checkmarkColor}
          type="monochrome"
          weight="semibold"
        />
      ) : null}
    </Pressable>
  );
}

/**
 * Provider section header with the harness logo. Secondary providers render
 * as a tappable fold (count + chevron while collapsed); primary providers
 * and the group holding the current selection are static headers.
 */
function ProviderHeader(props: {
  readonly driver: string | undefined;
  readonly label: string;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly modelCount: number;
  readonly onToggle: () => void;
}) {
  const iconSubtle = useThemeColor("--color-icon-subtle");
  const content = (
    <>
      <ProviderIcon provider={props.driver} size={15} />
      <Text className="text-sm font-t3-medium text-foreground-muted">{props.label}</Text>
      {props.collapsible ? (
        <>
          <View className="flex-1" />
          {props.collapsed ? (
            <Text className="text-2xs font-t3-medium text-foreground-muted">
              {props.modelCount}
            </Text>
          ) : null}
          <SymbolView
            name={props.collapsed ? "chevron.down" : "chevron.up"}
            size={12}
            tintColor={iconSubtle}
            type="monochrome"
          />
        </>
      ) : null}
    </>
  );

  if (props.collapsible) {
    return (
      <Pressable
        accessibilityLabel={`${props.label}, ${props.modelCount} models`}
        accessibilityRole="button"
        accessibilityState={{ expanded: !props.collapsed }}
        className="mx-4 mt-1 min-h-11 flex-row items-center gap-2 rounded-xl px-1 pt-2 active:opacity-60"
        onPress={props.onToggle}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityRole="header" className="mx-4 min-h-9 flex-row items-center gap-2 px-1 pt-1">
      {content}
    </View>
  );
}

/** Compact row that opens a single-choice submenu panel. */
function DisclosureRow(props: {
  readonly label: string;
  readonly value: string | undefined;
  readonly onPress: () => void;
  readonly isLast?: boolean;
}) {
  const iconSubtle = useThemeColor("--color-icon-subtle");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      className={cn(
        "min-h-11 flex-row items-center gap-2 bg-card px-4 py-2 active:bg-subtle",
        !props.isLast && "border-b border-border-subtle",
      )}
    >
      <Text className="text-sm font-t3-medium text-foreground">{props.label}</Text>
      <View className="flex-1" />
      {props.value ? (
        <Text className="text-sm text-foreground-muted" numberOfLines={1}>
          {props.value}
        </Text>
      ) : null}
      <SymbolView name="chevron.right" size={12} tintColor={iconSubtle} type="monochrome" />
    </Pressable>
  );
}

/** Single option inside a submenu panel. */
function ChoiceRow(props: {
  readonly label: string;
  readonly description?: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly isLast: boolean;
}) {
  const checkmarkColor = useThemeColor("--color-icon");
  return (
    <Pressable
      accessibilityLabel={props.description ? `${props.label}. ${props.description}` : props.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      className={cn(
        "min-h-14 flex-row items-center gap-3 bg-card px-4 py-3 active:bg-subtle",
        !props.isLast && "border-b border-border-subtle",
      )}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-t3-medium text-foreground">{props.label}</Text>
        {props.description ? (
          <Text className="text-sm leading-5 text-foreground-muted">{props.description}</Text>
        ) : null}
      </View>
      {props.selected ? (
        <SymbolView
          name="checkmark"
          size={16}
          tintColor={checkmarkColor}
          type="monochrome"
          weight="semibold"
        />
      ) : null}
    </Pressable>
  );
}

function SwitchRow(props: {
  readonly label: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly isLast?: boolean;
}) {
  return (
    <View
      className={cn(
        "min-h-11 flex-row items-center justify-between bg-card px-4 py-1",
        !props.isLast && "border-b border-border-subtle",
      )}
    >
      <Text className="text-sm font-t3-medium text-foreground">{props.label}</Text>
      <Switch
        accessibilityLabel={props.label}
        onValueChange={props.onValueChange}
        value={props.value}
      />
    </View>
  );
}

type ThreadSettingsSubmenuPage =
  | { readonly kind: "descriptor"; readonly id: string }
  | { readonly kind: "runtime" };

type ThreadSettingsSessionProps = {
  readonly providerGroups: ReadonlyArray<ProviderGroup>;
  readonly selectedModel: ModelSelection | null;
  readonly onSelectModel: (option: ModelOption) => void;
  readonly optionDescriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly onUpdateOptionSelections: (selections: ReadonlyArray<ProviderOptionSelection>) => void;
  readonly runtimeMode: RuntimeMode;
  readonly onUpdateRuntimeMode: (mode: RuntimeMode) => void;
};

export type ExistingThreadSettingsRouteSession = ThreadSettingsSessionProps & {
  readonly ownerId: string;
  readonly onDismissalStart: () => void;
  readonly onDismissalCancel: () => void;
};

type ExistingThreadSettingsRouteContextValue = {
  readonly session: ExistingThreadSettingsRouteSession | null;
  readonly present: (session: ExistingThreadSettingsRouteSession) => void;
  readonly clear: (ownerId: string) => void;
};

const ExistingThreadSettingsRouteContext =
  createContext<ExistingThreadSettingsRouteContextValue | null>(null);

/** Bridges the active thread's settings state into the root native sheet route. */
export function ExistingThreadSettingsRouteProvider(props: { readonly children: ReactNode }) {
  const [session, setSession] = useState<ExistingThreadSettingsRouteSession | null>(null);
  const present = useCallback((nextSession: ExistingThreadSettingsRouteSession) => {
    setSession(nextSession);
  }, []);
  const clear = useCallback((ownerId: string) => {
    setSession((current) => (current?.ownerId === ownerId ? null : current));
  }, []);
  const value = useMemo(() => ({ session, present, clear }), [clear, present, session]);

  return (
    <ExistingThreadSettingsRouteContext.Provider value={value}>
      {props.children}
    </ExistingThreadSettingsRouteContext.Provider>
  );
}

export function useExistingThreadSettingsRoutePresentation() {
  const value = use(ExistingThreadSettingsRouteContext);
  if (!value) {
    throw new Error(
      "useExistingThreadSettingsRoutePresentation must be used inside ExistingThreadSettingsRouteProvider.",
    );
  }
  return value;
}

type ThreadSettingsSessionValue = {
  readonly providerGroups: ReadonlyArray<ProviderGroup>;
  readonly runtimeMode: RuntimeMode;
  readonly onUpdateRuntimeMode: (mode: RuntimeMode) => void;
  readonly displayedDescriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly expandedProviders: ReadonlySet<string>;
  readonly hasLegacyModels: boolean;
  readonly pendingModel: ModelOption | null;
  readonly providerFilter: string | null;
  readonly searchQuery: string;
  readonly showLegacy: boolean;
  readonly applyOptionChange: (id: string, value: string | boolean) => void;
  readonly commitPendingModel: () => void;
  readonly isDisplayed: (option: ModelOption) => boolean;
  readonly pressModel: (option: ModelOption) => void;
  readonly setProviderFilter: (providerKey: string | null) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setShowLegacy: (showLegacy: boolean) => void;
  readonly toggleProvider: (providerKey: string) => void;
};

const ThreadSettingsSessionContext = createContext<ThreadSettingsSessionValue | null>(null);

/** Owns the staged model and option state for one picker presentation. */
function ThreadSettingsSessionProvider(
  props: ThreadSettingsSessionProps & { readonly children: ReactNode },
) {
  const [showLegacyToggle, setShowLegacyToggle] = useState(false);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedProviders, setExpandedProviders] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingModel, setPendingModel] = useState<ModelOption | null>(null);

  const isApplied = useCallback(
    (option: ModelOption) =>
      option.selection.instanceId === props.selectedModel?.instanceId &&
      option.selection.model === props.selectedModel.model,
    [props.selectedModel],
  );
  // The list highlights the staged pick; Save turns it into the applied one.
  const isDisplayed = useCallback(
    (option: ModelOption) => (pendingModel ? option.key === pendingModel.key : isApplied(option)),
    [isApplied, pendingModel],
  );

  // While a model is staged, the settings rows describe and edit the staged
  // model's options (kept on its pending selection); Save applies model and
  // options together. Otherwise they edit the applied selection directly.
  const displayedDescriptors = useMemo(
    () =>
      pendingModel
        ? pendingModel.capabilities
          ? getProviderOptionDescriptors({
              caps: pendingModel.capabilities,
              selections: pendingModel.selection.options,
            })
          : []
        : props.optionDescriptors,
    [pendingModel, props.optionDescriptors],
  );

  const hasLegacyModels = useMemo(
    () => props.providerGroups.some((group) => group.models.some((model) => model.isLegacy)),
    [props.providerGroups],
  );
  const commitPendingModel = useCallback(() => {
    if (pendingModel) {
      void Haptics.selectionAsync();
      props.onSelectModel(pendingModel);
    }
  }, [pendingModel, props.onSelectModel]);

  const applyOptionChange = useCallback(
    (id: string, value: string | boolean) => {
      const next = applyProviderOptionSelection(displayedDescriptors, { id, value });
      if (!next) {
        return;
      }
      if (pendingModel) {
        setPendingModel({
          ...pendingModel,
          selection: { ...pendingModel.selection, options: next },
        });
      } else {
        props.onUpdateOptionSelections(next);
      }
    },
    [displayedDescriptors, pendingModel, props.onUpdateOptionSelections],
  );

  const toggleProvider = useCallback((providerKey: string) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (!next.delete(providerKey)) {
        next.add(providerKey);
      }
      return next;
    });
  }, []);

  const pressModel = useCallback(
    (option: ModelOption) => {
      void Haptics.selectionAsync();
      setPendingModel((current) =>
        pendingModelAfterPress({
          current,
          pressed: option,
          pressedIsApplied: isApplied(option),
        }),
      );
    },
    [isApplied],
  );

  const value = useMemo<ThreadSettingsSessionValue>(
    () => ({
      providerGroups: props.providerGroups,
      runtimeMode: props.runtimeMode,
      onUpdateRuntimeMode: props.onUpdateRuntimeMode,
      displayedDescriptors,
      expandedProviders,
      hasLegacyModels,
      pendingModel,
      providerFilter,
      searchQuery,
      showLegacy: showLegacyToggle,
      applyOptionChange,
      commitPendingModel,
      isDisplayed,
      pressModel,
      setProviderFilter,
      setSearchQuery,
      setShowLegacy: setShowLegacyToggle,
      toggleProvider,
    }),
    [
      applyOptionChange,
      commitPendingModel,
      displayedDescriptors,
      expandedProviders,
      hasLegacyModels,
      isDisplayed,
      pendingModel,
      pressModel,
      providerFilter,
      props.onUpdateRuntimeMode,
      props.providerGroups,
      props.runtimeMode,
      searchQuery,
      showLegacyToggle,
      toggleProvider,
    ],
  );

  return (
    <ThreadSettingsSessionContext.Provider value={value}>
      {props.children}
    </ThreadSettingsSessionContext.Provider>
  );
}

function useThreadSettingsSession() {
  const value = use(ThreadSettingsSessionContext);
  if (!value) {
    throw new Error("useThreadSettingsSession must be used inside ThreadSettingsSessionProvider.");
  }
  return value;
}

type ThreadSettingsModelSection = {
  readonly key: string;
  readonly driver: string | undefined;
  readonly label: string;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly modelCount: number;
  readonly data: ReadonlyArray<ModelOption>;
};

function ThreadSettingsModelListRow(props: {
  readonly option: ModelOption;
  readonly isFirst: boolean;
  readonly isLast: boolean;
}) {
  const session = useThreadSettingsSession();
  const onPress = useCallback(
    () => session.pressModel(props.option),
    [props.option, session.pressModel],
  );

  return (
    <ModelRow
      isFirst={props.isFirst}
      isLast={props.isLast}
      onPress={onPress}
      option={props.option}
      selected={session.isDisplayed(props.option)}
    />
  );
}

function ThreadSettingsProviderListHeader(props: { readonly section: ThreadSettingsModelSection }) {
  const session = useThreadSettingsSession();
  const onToggle = useCallback(
    () => session.toggleProvider(props.section.key),
    [props.section.key, session.toggleProvider],
  );

  return (
    <ProviderHeader
      collapsible={props.section.collapsible}
      collapsed={props.section.collapsed}
      driver={props.section.driver}
      label={props.section.label}
      modelCount={props.section.modelCount}
      onToggle={onToggle}
    />
  );
}

function renderThreadSettingsModelItem(props: {
  readonly item: ModelOption;
  readonly index: number;
  readonly section: ThreadSettingsModelSection;
}) {
  return (
    <ThreadSettingsModelListRow
      isFirst={props.index === 0}
      isLast={props.index === props.section.data.length - 1}
      option={props.item}
    />
  );
}

function renderThreadSettingsProviderHeader(props: {
  readonly section: ThreadSettingsModelSection;
}) {
  return <ThreadSettingsProviderListHeader section={props.section} />;
}

function useThreadSettingsModelSections(
  session: ThreadSettingsSessionValue,
): ReadonlyArray<ThreadSettingsModelSection> {
  return useMemo(
    () =>
      session.providerGroups.flatMap((group) => {
        if (session.providerFilter !== null && group.providerKey !== session.providerFilter) {
          return [];
        }
        const driver = group.models[0]?.providerDriver;
        const catalogModels = session.showLegacy
          ? group.models
          : group.models.filter((model) => !model.isLegacy || session.isDisplayed(model));
        const visibleModels = catalogModels.filter((model) =>
          modelMatchesCatalogQuery({
            model,
            providerLabel: group.providerLabel,
            query: session.searchQuery,
          }),
        );
        if (visibleModels.length === 0) {
          return [];
        }
        const isPrimary = driver !== undefined && PRIMARY_PROVIDER_DRIVERS.has(driver);
        const containsSelection = group.models.some(session.isDisplayed);
        const isNarrowed = session.providerFilter !== null || session.searchQuery.trim().length > 0;
        const collapsible = !isPrimary && !containsSelection && !isNarrowed;
        const collapsed = collapsible && !session.expandedProviders.has(group.providerKey);
        return [
          {
            key: group.providerKey,
            driver,
            label: group.providerLabel,
            collapsible,
            collapsed,
            modelCount: visibleModels.length,
            data: collapsed ? [] : visibleModels,
          },
        ];
      }),
    [
      session.expandedProviders,
      session.isDisplayed,
      session.providerFilter,
      session.providerGroups,
      session.searchQuery,
      session.showLegacy,
    ],
  );
}

function ThreadSettingsOptionsFooter(props: {
  readonly onOpenSubmenu: (submenu: ThreadSettingsSubmenuPage) => void;
}) {
  const insets = useSafeAreaInsets();
  const session = useThreadSettingsSession();
  const bottomToolbarInset =
    Platform.OS === "ios" && NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED
      ? NATIVE_MAIL_SEARCH_TOOLBAR_CONTENT_INSET
      : 0;

  return (
    <View style={{ paddingBottom: insets.bottom + bottomToolbarInset + 12 }}>
      <Text className="px-5 pb-2 pt-2 text-sm font-t3-medium text-foreground-muted">Options</Text>
      <View className="mx-4 overflow-hidden rounded-2xl bg-card">
        {session.displayedDescriptors.map((descriptor) => {
          if (descriptor.type === "select") {
            return (
              <DisclosureRow
                key={descriptor.id}
                label={descriptor.label}
                value={getProviderOptionCurrentLabel(descriptor)}
                onPress={() => props.onOpenSubmenu({ kind: "descriptor", id: descriptor.id })}
              />
            );
          }
          return (
            <SwitchRow
              key={descriptor.id}
              label={descriptor.label}
              value={descriptor.currentValue ?? false}
              onValueChange={(value) => session.applyOptionChange(descriptor.id, value)}
            />
          );
        })}
        <DisclosureRow
          isLast
          label="Runtime"
          value={RUNTIME_MODE_CHOICES.find((choice) => choice.mode === session.runtimeMode)?.label}
          onPress={() => props.onOpenSubmenu({ kind: "runtime" })}
        />
      </View>

      {Platform.OS !== "ios" && session.hasLegacyModels ? (
        <>
          <Text className="px-5 pb-2 pt-7 text-sm font-t3-medium text-foreground-muted">
            Catalog
          </Text>
          <View className="mx-4 overflow-hidden rounded-2xl bg-card">
            <SwitchRow
              isLast
              label="Legacy models"
              onValueChange={session.setShowLegacy}
              value={session.showLegacy}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

/** One native scroll owner for the model catalog and its related settings. */
function ThreadSettingsMainContent(props: {
  readonly onOpenSubmenu: (submenu: ThreadSettingsSubmenuPage) => void;
}) {
  const session = useThreadSettingsSession();
  const sections = useThreadSettingsModelSections(session);
  const listRef = useRef<SectionList<ModelOption, ThreadSettingsModelSection>>(null);
  const hasActiveCatalogFilter =
    session.providerFilter !== null || session.searchQuery.trim().length > 0;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      listRef.current?.getScrollResponder()?.scrollTo({ animated: false, y: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [session.providerFilter, session.searchQuery, session.showLegacy]);

  return (
    <SectionList
      ref={listRef}
      automaticallyAdjustsScrollIndicatorInsets
      className="flex-1 bg-sheet"
      contentContainerStyle={{ paddingTop: 4 }}
      contentInsetAdjustmentBehavior="automatic"
      keyExtractor={(option) => option.key}
      ListEmptyComponent={
        hasActiveCatalogFilter ? (
          <View className="items-center px-8 py-14">
            <Text className="text-center text-sm text-foreground-muted">No matching models</Text>
          </View>
        ) : null
      }
      ListFooterComponent={<ThreadSettingsOptionsFooter onOpenSubmenu={props.onOpenSubmenu} />}
      ListHeaderComponent={
        Platform.OS === "android" ? (
          <View className="px-4 pb-2 pt-3">
            <TextInput
              accessibilityLabel="Find a model"
              autoCapitalize="none"
              autoCorrect={false}
              className="h-11 rounded-xl bg-card px-4 text-base text-foreground"
              onChangeText={session.setSearchQuery}
              placeholder="Find a model"
              placeholderTextColorClassName="accent-placeholder"
              value={session.searchQuery}
            />
          </View>
        ) : null
      }
      renderItem={renderThreadSettingsModelItem}
      renderSectionHeader={renderThreadSettingsProviderHeader}
      sections={sections}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
    />
  );
}

/** Compact choice page pushed by the picker navigator. */
function ThreadSettingsChoiceContent(props: {
  readonly submenu: ThreadSettingsSubmenuPage;
  readonly onSelected: () => void;
}) {
  const insets = useSafeAreaInsets();
  const session = useThreadSettingsSession();
  const descriptorId = props.submenu.kind === "descriptor" ? props.submenu.id : null;

  const activeDescriptor =
    descriptorId !== null
      ? session.displayedDescriptors.find(
          (descriptor) => descriptor.type === "select" && descriptor.id === descriptorId,
        )
      : undefined;

  const submenuContent =
    props.submenu.kind === "runtime"
      ? {
          rows: RUNTIME_MODE_CHOICES.map((choice) => ({
            id: choice.mode,
            label: choice.label,
            description: choice.description,
            selected: choice.mode === session.runtimeMode,
            onPress: () => {
              void Haptics.selectionAsync();
              session.onUpdateRuntimeMode(choice.mode);
              props.onSelected();
            },
          })),
        }
      : activeDescriptor?.type === "select"
        ? {
            rows: selectableChoices(activeDescriptor).map((choice) => ({
              id: choice.id,
              label: choice.label,
              description: undefined,
              selected: choice.id === getProviderOptionCurrentValue(activeDescriptor),
              onPress: () => {
                void Haptics.selectionAsync();
                session.applyOptionChange(activeDescriptor.id, choice.id);
                props.onSelected();
              },
            })),
          }
        : null;

  if (!submenuContent) {
    return <View className="flex-1 bg-sheet" />;
  }

  return (
    <ScrollView
      className="flex-1 bg-sheet"
      contentContainerStyle={{
        paddingBottom: insets.bottom + 12,
        paddingHorizontal: 16,
        paddingTop: 16,
      }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View className="overflow-hidden rounded-2xl bg-card">
        {submenuContent.rows.map((row, index) => (
          <ChoiceRow
            key={row.id}
            description={row.description}
            isLast={index === submenuContent.rows.length - 1}
            label={row.label}
            selected={row.selected}
            onPress={row.onPress}
          />
        ))}
      </View>
    </ScrollView>
  );
}

type ThreadSettingsPickerStackParams = {
  ThreadSettingsModels: undefined;
  ThreadSettingsChoice: ThreadSettingsSubmenuPage & { readonly title: string };
};

type ThreadSettingsPickerPresentation = {
  readonly onClose: () => void;
};

const ThreadSettingsPickerStack = createNativeStackNavigator<ThreadSettingsPickerStackParams>();
const ThreadSettingsPickerPresentationContext =
  createContext<ThreadSettingsPickerPresentation | null>(null);

function useThreadSettingsPickerPresentation() {
  const value = use(ThreadSettingsPickerPresentationContext);
  if (!value) {
    throw new Error(
      "useThreadSettingsPickerPresentation must be used inside ThreadSettingsPickerNavigator.",
    );
  }
  return value;
}

function ThreadSettingsModelsScreen() {
  const session = useThreadSettingsSession();
  const presentation = useThreadSettingsPickerPresentation();
  const navigation = useNavigation<NativeStackNavigationProp<ThreadSettingsPickerStackParams>>();
  const usesNativeMailSearchToolbar = Platform.OS === "ios" && NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED;
  const hasCustomCatalogFilter = session.providerFilter !== null || session.showLegacy;
  const filterMenu = useMemo(
    () => ({
      title: "Model filters",
      items: [
        {
          type: "submenu" as const,
          title: "Provider",
          items: [
            {
              type: "action" as const,
              title: "All providers",
              state: session.providerFilter === null ? ("on" as const) : ("off" as const),
              onPress: () => session.setProviderFilter(null),
            },
            ...session.providerGroups.map((group) => ({
              type: "action" as const,
              title: group.providerLabel,
              state:
                session.providerFilter === group.providerKey ? ("on" as const) : ("off" as const),
              onPress: () => session.setProviderFilter(group.providerKey),
            })),
          ],
        },
        ...(session.hasLegacyModels
          ? [
              {
                type: "action" as const,
                title: "Show legacy models",
                state: session.showLegacy ? ("on" as const) : ("off" as const),
                onPress: () => session.setShowLegacy(!session.showLegacy),
              },
            ]
          : []),
      ],
    }),
    [session],
  );

  return (
    <>
      <NativeStackScreenOptions
        optionsVersion={[
          session.providerFilter,
          session.providerGroups.map((group) => group.providerKey),
          session.showLegacy,
        ]}
        options={{
          unstable_headerToolbarItems: usesNativeMailSearchToolbar
            ? () => [
                createNativeMailSearchToolbarItem({
                  filterButtonId: "thread-settings-model-filter",
                  filterMenu,
                  filterSystemImageName: hasCustomCatalogFilter
                    ? "line.3.horizontal.decrease.circle.fill"
                    : "line.3.horizontal.decrease",
                  onSearchTextChange: session.setSearchQuery,
                  placeholder: "Find a model",
                  searchTextChangeId: "thread-settings-model-search-text",
                }),
              ]
            : undefined,
          headerSearchBarOptions:
            Platform.OS === "ios" && !usesNativeMailSearchToolbar
              ? {
                  autoCapitalize: "none",
                  hideNavigationBar: false,
                  obscureBackground: false,
                  onCancelButtonPress: () => session.setSearchQuery(""),
                  onChangeText: (event) => session.setSearchQuery(event.nativeEvent.text),
                  placeholder: "Find a model",
                }
              : undefined,
        }}
      />
      <ThreadSettingsMainContent
        onOpenSubmenu={(submenu) => {
          const title =
            submenu.kind === "runtime"
              ? "Runtime"
              : (session.displayedDescriptors.find(
                  (descriptor) => descriptor.type === "select" && descriptor.id === submenu.id,
                )?.label ?? "Option");
          navigation.navigate("ThreadSettingsChoice", { ...submenu, title });
        }}
      />
      <NativeHeaderToolbar placement="left">
        <NativeHeaderToolbar.Button
          accessibilityLabel="Cancel thread settings"
          label="Cancel"
          onPress={presentation.onClose}
        />
      </NativeHeaderToolbar>
      <NativeHeaderToolbar placement="right">
        <NativeHeaderToolbar.Button
          accessibilityLabel={session.pendingModel ? "Save thread settings" : "Done"}
          label={session.pendingModel ? "Save" : "Done"}
          onPress={() => {
            session.commitPendingModel();
            presentation.onClose();
          }}
        />
      </NativeHeaderToolbar>
      {Platform.OS === "ios" && !usesNativeMailSearchToolbar ? (
        <NativeHeaderToolbar placement="bottom">
          <NativeHeaderToolbar.Menu
            accessibilityLabel="Filter models"
            icon={
              hasCustomCatalogFilter
                ? "line.3.horizontal.decrease.circle.fill"
                : "line.3.horizontal.decrease.circle"
            }
            separateBackground
            title="Model filters"
          >
            <NativeHeaderToolbar.Menu title="Provider">
              <NativeHeaderToolbar.Label>Provider</NativeHeaderToolbar.Label>
              <NativeHeaderToolbar.MenuAction
                isOn={session.providerFilter === null}
                onPress={() => session.setProviderFilter(null)}
              >
                All providers
              </NativeHeaderToolbar.MenuAction>
              {session.providerGroups.map((group) => (
                <NativeHeaderToolbar.MenuAction
                  key={group.providerKey}
                  isOn={session.providerFilter === group.providerKey}
                  onPress={() => session.setProviderFilter(group.providerKey)}
                >
                  {group.providerLabel}
                </NativeHeaderToolbar.MenuAction>
              ))}
            </NativeHeaderToolbar.Menu>
            {session.hasLegacyModels ? (
              <NativeHeaderToolbar.MenuAction
                isOn={session.showLegacy}
                onPress={() => session.setShowLegacy(!session.showLegacy)}
              >
                Show legacy models
              </NativeHeaderToolbar.MenuAction>
            ) : null}
          </NativeHeaderToolbar.Menu>
        </NativeHeaderToolbar>
      ) : null}
    </>
  );
}

function ThreadSettingsChoiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ThreadSettingsPickerStackParams>>();
  const route = useRoute<RouteProp<ThreadSettingsPickerStackParams, "ThreadSettingsChoice">>();

  return (
    <ThreadSettingsChoiceContent submenu={route.params} onSelected={() => navigation.goBack()} />
  );
}

function ThreadSettingsPickerNavigator(props: ThreadSettingsPickerPresentation) {
  const sheetBackground = String(useThemeColor("--color-sheet"));
  const foreground = String(useThemeColor("--color-foreground"));
  const nativeSheetBackground = NATIVE_SHEET_SURFACE_COLOR ?? sheetBackground;
  const presentation = useMemo(
    () => ({
      onClose: props.onClose,
    }),
    [props.onClose],
  );

  return (
    <ThreadSettingsPickerPresentationContext.Provider value={presentation}>
      <ThreadSettingsPickerStack.Navigator
        initialRouteName="ThreadSettingsModels"
        screenOptions={{
          animation: "slide_from_right",
          contentStyle: NATIVE_SHEET_SURFACE_CONTENT_STYLE ?? {
            backgroundColor: nativeSheetBackground,
          },
          gestureEnabled: true,
          headerBackButtonDisplayMode: "minimal",
          headerBackTitle: "",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: nativeSheetBackground as unknown as string },
          headerTintColor: foreground,
          headerTitleStyle: { fontSize: 17, fontWeight: "700" },
        }}
      >
        <ThreadSettingsPickerStack.Screen
          name="ThreadSettingsModels"
          component={ThreadSettingsModelsScreen}
          options={{ headerBackVisible: false, title: "Thread settings" }}
        />
        <ThreadSettingsPickerStack.Screen
          name="ThreadSettingsChoice"
          component={ThreadSettingsChoiceScreen}
          options={({ route }) => ({ title: route.params.title })}
        />
      </ThreadSettingsPickerStack.Navigator>
    </ThreadSettingsPickerPresentationContext.Provider>
  );
}

/** Existing-thread model picker hosted by the root RNS form-sheet route. */
export function ExistingThreadSettingsRouteScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const presentation = useExistingThreadSettingsRoutePresentation();
  const session = presentation.session;

  useEffect(() => {
    if (session) {
      return;
    }

    navigation.goBack();
  }, [navigation, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const removeTransitionStart = navigation.addListener("transitionStart", (event) => {
      if (event.data.closing) {
        session.onDismissalStart();
      }
    });
    const removeGestureCancel = navigation.addListener("gestureCancel", () => {
      session.onDismissalCancel();
    });
    return () => {
      removeTransitionStart();
      removeGestureCancel();
    };
  }, [navigation, session]);

  if (!session) {
    return <View className="flex-1 bg-sheet" />;
  }

  const {
    ownerId: _ownerId,
    onDismissalStart: _onDismissalStart,
    onDismissalCancel: _onDismissalCancel,
    ...settings
  } = session;

  return (
    <ThreadSettingsSessionProvider {...settings}>
      <ThreadSettingsPickerNavigator onClose={() => navigation.goBack()} />
    </ThreadSettingsSessionProvider>
  );
}

/**
 * Native stack hosted by the New Task navigator's form-sheet route. Keeping
 * the sheet presentation in RNS gives UIKit ownership of nested dismissal,
 * while Reasoning and Runtime remain regular pushes inside this navigator.
 */
export function NewTaskThreadSettingsRouteScreen() {
  const flow = useNewTaskFlow();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const transition = useNewTaskSettingsTransition();
  const optionDescriptors = useMemo(
    () =>
      resolveProviderOptionDescriptors({
        capabilities: flow.selectedModelOption?.capabilities,
        selections: flow.selectedModel?.options,
      }),
    [flow.selectedModel?.options, flow.selectedModelOption?.capabilities],
  );
  useEffect(() => {
    const removeTransitionStart = navigation.addListener("transitionStart", (event) => {
      if (event.data.closing) {
        transition.notifyDismissalStart();
      }
    });
    const removeGestureCancel = navigation.addListener("gestureCancel", () => {
      transition.notifyDismissalCancel();
    });
    return () => {
      removeTransitionStart();
      removeGestureCancel();
    };
  }, [navigation, transition]);

  return (
    <ThreadSettingsSessionProvider
      providerGroups={flow.providerGroups}
      selectedModel={flow.selectedModel}
      onSelectModel={(option) => flow.setSelectedModelKey(option.key, option.selection.options)}
      optionDescriptors={optionDescriptors}
      onUpdateOptionSelections={flow.setSelectedModelOptions}
      runtimeMode={flow.runtimeMode}
      onUpdateRuntimeMode={flow.setRuntimeMode}
    >
      <ThreadSettingsPickerNavigator onClose={() => navigation.goBack()} />
    </ThreadSettingsSessionProvider>
  );
}
