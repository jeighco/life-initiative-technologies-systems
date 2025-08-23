//
//  RCTViewCompatibilityFix.m
//  MultiRoomMusicApp
//
//  iOS compatibility fixes for React Native Modal components
//

#import "RCTViewCompatibilityFix.h"
#import <React/RCTLog.h>

@implementation RCTView (CompatibilityFix)

- (void)setSheetLargestUndimmedDetent:(NSString *)detent
{
  // Safely ignore this iOS 15+ sheet method to prevent crashes
  RCTLogWarn(@"[COMPATIBILITY] setSheetLargestUndimmedDetent called but not implemented - ignoring safely");
  
  // In a real implementation, this would handle iOS 15+ sheet presentation
  // For now, we'll just prevent the crash by providing an empty implementation
}

@end