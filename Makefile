WITNESS_DIR ?= ./tmp
WITNESS_FILE ?= witness.so

BUILD_DIR := ./build

CXX := g++
CXXFLAGS := -std=c++17 -Wall -pthread -flarge-source-files -Wno-unused-label -rdynamic -mavx2 -O3 #-Wfatal-errors
CXXFLAGS_EXT := -fPIC
CFLAGS := -fopenmp -Wno-unused-variable

CPPFLAGS := -I ./src/setup/circom -MMD -MP

AS := nasm
ASFLAGS := -felf64


witness: $(WITNESS_DIR)/$(WITNESS_FILE)

clean:
	$(RM) -r $(BUILD_DIR)

SRCS_WITNESS_LIB := $(shell find ./src/setup/circom -name *.cpp)
OBJS_WITNESS_LIB := $(SRCS_WITNESS_LIB:%=$(BUILD_DIR)/%.o)
DEPS_WITNESS_LIB := $(OBJS_WITNESS_LIB:.o=.d)

$(WITNESS_DIR)/$(WITNESS_FILE): $(OBJS_WITNESS_LIB)
	$(MKDIR_P) $(WITNESS_DIR)
	$(CXX) -shared -o $@ $^

# Assembly compilation rule
$(BUILD_DIR)/%.asm.o: %.asm
	$(MKDIR_P) $(dir $@)
	$(AS) $(ASFLAGS) $< -o $@

# C++ source compilation rule
$(BUILD_DIR)/%.cpp.o: %.cpp
	$(MKDIR_P) $(dir $@)
	$(CXX) $(CFLAGS) $(CPPFLAGS) $(CXXFLAGS) $(CXXFLAGS_EXT) -c $< -o $@

MKDIR_P ?= mkdir -p

.PHONY: clean