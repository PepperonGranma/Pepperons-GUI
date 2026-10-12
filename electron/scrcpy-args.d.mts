export declare const VALUE_OPTIONS: Set<string>
export declare const OPTIONAL_VALUE_OPTIONS: Set<string>
export declare const BOOLEAN_OPTIONS: Set<string>
export declare const OPTION_NAMES: string[]
export declare const ENUM_VALUES: Record<string, string[]>
export declare function validateOptionValue(name: string, value: string, runtimeVersion?: string): string
export declare function validateArgs(args: string[], runtimeVersion?: string): string[]
export declare function serialFromArgs(args: string[]): string
export declare function argsEqual(left: string[], right: string[]): boolean
export declare function formatCommand(args: string[]): string
export declare function aoaInputOptions(args: string[]): string[]
export declare const AOA_WINDOWS_MESSAGE: string
export declare function platformIssue(args: string[], platform: string): string
