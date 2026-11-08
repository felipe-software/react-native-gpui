#include <JavaScriptCore/JavaScript.h>

#include <dlfcn.h>

#include <cstdio>
#include <cstdlib>
#include <string>

namespace {

const char* const kCandidates[] = {
    "libjavascriptcoregtk-4.1.so.0",
    "libjavascriptcoregtk-6.0.so.1",
    "libjavascriptcoregtk-4.0.so.18",
};

void* library() {
  static void* handle = [] () -> void* {
    std::string tried;
    if (const char* forced = std::getenv("RNGPUI_JSC_LIBRARY"); forced && *forced) {
      if (void* lib = dlopen(forced, RTLD_NOW | RTLD_LOCAL)) return lib;
      tried += std::string("\n  ") + forced + ": " + dlerror();
    }
    for (const char* name : kCandidates) {
      if (void* lib = dlopen(name, RTLD_NOW | RTLD_LOCAL)) return lib;
      tried += std::string("\n  ") + name + ": " + dlerror();
    }
    std::fprintf(stderr,
                 "[jsc] JavaScriptCore was not found. react-native-gpui runs your app on the "
                 "system JavaScriptCore from WebKitGTK. Install it with one of:\n"
                 "  Debian/Ubuntu: sudo apt install libjavascriptcoregtk-4.1-0\n"
                 "  Fedora:        sudo dnf install javascriptcoregtk4.1\n"
                 "  Arch:          sudo pacman -S webkit2gtk-4.1\n"
                 "or point RNGPUI_JSC_LIBRARY at a libjavascriptcoregtk shared library. Tried:%s\n",
                 tried.c_str());
    return nullptr;
  }();
  return handle;
}

void* resolve(const char* name, bool required) {
  void* lib = library();
  void* symbol = lib ? dlsym(lib, name) : nullptr;
  if (!symbol && required) {
    std::fprintf(stderr, "[jsc] JavaScriptCore is missing %s\n", name);
    std::abort();
  }
  return symbol;
}

template <typename Fn>
Fn api(const char* name, bool required = true) {
  return reinterpret_cast<Fn>(resolve(name, required));
}

}  // namespace

#define RNG_JSC_FN(name) \
  static const auto fn = api<decltype(&::name)>(#name)

extern "C" {

const JSClassDefinition kJSClassDefinitionEmpty = {};

JSGlobalContextRef JSGlobalContextCreate(JSClassRef globalObjectClass) {
  static const auto fn = api<decltype(&::JSGlobalContextCreate)>("JSGlobalContextCreate", false);
  return fn ? fn(globalObjectClass) : nullptr;
}

void JSGlobalContextRelease(JSGlobalContextRef ctx) {
  RNG_JSC_FN(JSGlobalContextRelease);
  fn(ctx);
}

JSObjectRef JSContextGetGlobalObject(JSContextRef ctx) {
  RNG_JSC_FN(JSContextGetGlobalObject);
  return fn(ctx);
}

JSValueRef JSEvaluateScript(JSContextRef ctx, JSStringRef script, JSObjectRef thisObject,
                            JSStringRef sourceURL, int startingLineNumber,
                            JSValueRef* exception) {
  RNG_JSC_FN(JSEvaluateScript);
  return fn(ctx, script, thisObject, sourceURL, startingLineNumber, exception);
}

JSClassRef JSClassCreate(const JSClassDefinition* definition) {
  RNG_JSC_FN(JSClassCreate);
  return fn(definition);
}

JSObjectRef JSObjectMake(JSContextRef ctx, JSClassRef jsClass, void* data) {
  RNG_JSC_FN(JSObjectMake);
  return fn(ctx, jsClass, data);
}

void* JSObjectGetPrivate(JSObjectRef object) {
  RNG_JSC_FN(JSObjectGetPrivate);
  return fn(object);
}

JSValueRef JSObjectGetProperty(JSContextRef ctx, JSObjectRef object, JSStringRef propertyName,
                               JSValueRef* exception) {
  RNG_JSC_FN(JSObjectGetProperty);
  return fn(ctx, object, propertyName, exception);
}

void JSObjectSetProperty(JSContextRef ctx, JSObjectRef object, JSStringRef propertyName,
                         JSValueRef value, JSPropertyAttributes attributes,
                         JSValueRef* exception) {
  RNG_JSC_FN(JSObjectSetProperty);
  fn(ctx, object, propertyName, value, attributes, exception);
}

bool JSObjectIsFunction(JSContextRef ctx, JSObjectRef object) {
  RNG_JSC_FN(JSObjectIsFunction);
  return fn(ctx, object);
}

JSValueRef JSObjectCallAsFunction(JSContextRef ctx, JSObjectRef object, JSObjectRef thisObject,
                                  size_t argumentCount, const JSValueRef arguments[],
                                  JSValueRef* exception) {
  RNG_JSC_FN(JSObjectCallAsFunction);
  return fn(ctx, object, thisObject, argumentCount, arguments, exception);
}

JSObjectRef JSObjectMakeArrayBufferWithBytesNoCopy(
    JSContextRef ctx, void* bytes, size_t byteLength,
    JSTypedArrayBytesDeallocator bytesDeallocator, void* deallocatorContext,
    JSValueRef* exception) {
  RNG_JSC_FN(JSObjectMakeArrayBufferWithBytesNoCopy);
  return fn(ctx, bytes, byteLength, bytesDeallocator, deallocatorContext, exception);
}

JSStringRef JSStringCreateWithUTF8CString(const char* string) {
  RNG_JSC_FN(JSStringCreateWithUTF8CString);
  return fn(string);
}

void JSStringRelease(JSStringRef string) {
  RNG_JSC_FN(JSStringRelease);
  fn(string);
}

size_t JSStringGetMaximumUTF8CStringSize(JSStringRef string) {
  RNG_JSC_FN(JSStringGetMaximumUTF8CStringSize);
  return fn(string);
}

size_t JSStringGetUTF8CString(JSStringRef string, char* buffer, size_t bufferSize) {
  RNG_JSC_FN(JSStringGetUTF8CString);
  return fn(string, buffer, bufferSize);
}

bool JSValueIsString(JSContextRef ctx, JSValueRef value) {
  RNG_JSC_FN(JSValueIsString);
  return fn(ctx, value);
}

bool JSValueIsNumber(JSContextRef ctx, JSValueRef value) {
  RNG_JSC_FN(JSValueIsNumber);
  return fn(ctx, value);
}

bool JSValueIsObject(JSContextRef ctx, JSValueRef value) {
  RNG_JSC_FN(JSValueIsObject);
  return fn(ctx, value);
}

JSValueRef JSValueMakeUndefined(JSContextRef ctx) {
  RNG_JSC_FN(JSValueMakeUndefined);
  return fn(ctx);
}

JSValueRef JSValueMakeNumber(JSContextRef ctx, double number) {
  RNG_JSC_FN(JSValueMakeNumber);
  return fn(ctx, number);
}

JSValueRef JSValueMakeString(JSContextRef ctx, JSStringRef string) {
  RNG_JSC_FN(JSValueMakeString);
  return fn(ctx, string);
}

JSObjectRef JSValueToObject(JSContextRef ctx, JSValueRef value, JSValueRef* exception) {
  RNG_JSC_FN(JSValueToObject);
  return fn(ctx, value, exception);
}

JSStringRef JSValueToStringCopy(JSContextRef ctx, JSValueRef value, JSValueRef* exception) {
  RNG_JSC_FN(JSValueToStringCopy);
  return fn(ctx, value, exception);
}

}  // extern "C"
