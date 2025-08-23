//
//  RCTViewCompatibilityFix.h
//  MultiRoomMusicApp
//
//  iOS compatibility fixes for React Native Modal components
//

#import <React/RCTView.h>

@interface RCTView (CompatibilityFix)

// Add missing iOS sheet presentation methods to prevent crashes
- (void)setSheetLargestUndimmedDetent:(NSString *)detent;

@end